import "server-only";
import type { z } from "zod";
import { inTransaction, type Database, type Transaction } from "@/server/repositories/database";
import * as assignments from "@/server/repositories/assignments";
import * as departures from "@/server/repositories/departures";
import { assignStaffSchema, assignVehicleSchema, type AssignmentDto } from "@/schemas/assignment";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { AppError } from "@/server/errors";
import { assertVehicleAssignable, vietnamDay } from "./fleet";
import { bindDb } from "./bind-db";

// Running/Ended trips keep their crew and seats; MVP has no cancel or reschedule.
const assignableStatuses = ["Draft", "Open", "Closed", "Confirmed"];
const closedDepartures = ["Ended", "Cancelled", "Rescheduled"] as const;
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}
function assertId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new AppError("INVALID_INPUT", 422);
}
async function hrManager(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["HRMgr"]);
  return actor;
}
// Writes lock the departure, then shared vehicle/staff resources, then account rows.
async function lockDeparture(tx: Transaction, departureId: number) {
  const departure = await departures.lockDeparture(tx, departureId);
  if (!departure) throw new AppError("NOT_FOUND", 404);
  if (!assignableStatuses.includes(departure.status)) throw new AppError("RESOURCE_CONFLICT", 409);
  return departure;
}
async function readAssignments(db: AuthDatabase, departureId: number): Promise<AssignmentDto> {
  const row = await assignments.findAssignments(db, departureId);
  if (!row) throw new AppError("NOT_FOUND", 404);
  return dto(row);
}
function dto(row: assignments.AssignmentRow): AssignmentDto {
  return { departure_id: row.departure_id, status: row.status, vehicles: row.vehicles.map((item) => ({
    dep_vehicle_id: item.dep_vehicle_id, vehicle_id: item.vehicle_id, plate_number: item.vehicle.plate_number,
    seat_count: item.vehicle.seat_count, generated_seats: item._count.seats,
    staff: item.staff.map(({ staff, ...rest }) => ({ ...rest, full_name: staff.full_name })) })) };
}

export async function listAssignments(db: Database, identity: Actor, departureId: number) {
  assertId(departureId);
  return inTransaction(db, async (tx) => {
    const actor = await requireActor(tx, identity);
    requireRole(actor, ["HRMgr", "RouteMgr", "Leader"]);
    const row = await assignments.findAssignments(tx, departureId);
    if (!row) throw new AppError("NOT_FOUND", 404);
    if (actor.role === "RouteMgr" && row.invoice_owner_user_id !== actor.user_id) throw new AppError("FORBIDDEN", 403);
    if (actor.role === "Leader" && (!["Confirmed", "Running", "Ended"].includes(row.status)
      || !row.vehicles.some((vehicle) => vehicle.staff.some((staff) => staff.role_in_trip === "Leader"
        && staff.staff.user_id === actor.user_id && staff.staff.status === "Active" && staff.staff.staff_type === "Leader")))) {
      throw new AppError("FORBIDDEN", 403);
    }
    return dto(row);
  }, { isolationLevel: "RepeatableRead" });
}

type AssignmentRole = z.infer<typeof assignStaffSchema>["role_in_trip"];
async function assertStaffEligible(tx: Transaction, staffId: number, role: AssignmentRole, departureDate: Date) {
  // Different departures serialize on this shared row before eligibility and busy checks.
  const staff = await assignments.lockStaff(tx, staffId);
  if (!staff) throw new AppError("NOT_FOUND", 404);
  const { date } = vietnamDay(departureDate);
  const user = role === "Leader" && staff.user_id ? await departures.lockUser(tx, staff.user_id) : null;
  if (staff.status !== "Active" || staff.staff_type !== role
    || (role === "Driver" && (!staff.license_number || !staff.license_expiry || staff.license_expiry < date))
    || (role === "Leader" && (user?.role !== "Leader" || user.status !== "Active"))) throw new AppError("ACCESS_CONFLICT", 409);
}
export async function assertOpeningAssignments(tx: Transaction, departureId: number, departureDate: Date) {
  const resources = await assignments.listResources(tx, departureId);
  if (!resources.length) throw new AppError("RESOURCE_CONFLICT", 409);
  for (const resource of resources) {
    const vehicle = await assertVehicleAssignable(tx, resource.vehicle_id, departureDate, departureId);
    const activeIds = new Set(vehicle.seats.filter((seat) => seat.is_active).map((seat) => seat.seat_id));
    if (!activeIds.size || resource.seats.length !== activeIds.size || resource.seats.some((seat) => !activeIds.has(seat.seat_id))) {
      throw new AppError("RESOURCE_CONFLICT", 409);
    }
    if (resource.staff.filter((staff) => staff.role_in_trip === "Driver").length > 1) throw new AppError("RESOURCE_CONFLICT", 409);
  }
  const { range } = vietnamDay(departureDate);
  const crew = resources.flatMap((resource) => resource.staff).sort((a, b) => a.staff_id - b.staff_id);
  for (const staff of crew) {
    await assertStaffEligible(tx, staff.staff_id, staff.role_in_trip, departureDate);
    if (await assignments.countBusyStaff(tx, departureId, staff.staff_id, range, closedDepartures)) throw new AppError("RESOURCE_CONFLICT", 409);
  }
}

export async function assignVehicle(db: Database, identity: Actor, departureId: number, input: unknown) {
  assertId(departureId);
  const { vehicle_id } = parse(assignVehicleSchema, input);
  return inTransaction(db, async (tx) => {
    await hrManager(tx, identity);
    const departure = await lockDeparture(tx, departureId);
    const vehicle = await assertVehicleAssignable(tx, vehicle_id, departure.departure_date, departureId);
    await assignments.ensureVehicleSeats(tx, departureId, vehicle_id,
      vehicle.seats.filter((seat) => seat.is_active).map((seat) => seat.seat_id));
    return readAssignments(tx, departureId);
  });
}

export async function unassignVehicle(db: Database, identity: Actor, departureId: number, vehicleId: number) {
  assertId(departureId); assertId(vehicleId);
  return inTransaction(db, async (tx) => {
    await hrManager(tx, identity);
    const departure = await lockDeparture(tx, departureId);
    const assignment = await assignments.findVehicle(tx, departureId, vehicleId);
    if (!assignment) throw new AppError("NOT_FOUND", 404);
    // Held or sold seats, or any ticket history, pin the vehicle to this departure.
    const used = await assignments.countUsedSeats(tx, assignment.dep_vehicle_id);
    const remaining = await departures.countResources(tx, departureId);
    if (used || (departure.status !== "Draft" && remaining <= 1)) throw new AppError("RESOURCE_CONFLICT", 409);
    const resources = await assignments.listResources(tx, departureId);
    const crew = resources.find((item) => item.dep_vehicle_id === assignment.dep_vehicle_id)!.staff;
    for (const staff of crew.sort((a, b) => a.staff_id - b.staff_id)) await assignments.lockStaff(tx, staff.staff_id);
    await assignments.removeVehicle(tx, assignment.dep_vehicle_id);
    return readAssignments(tx, departureId);
  });
}

export async function assignStaff(db: Database, identity: Actor, departureId: number, input: unknown) {
  assertId(departureId);
  const { staff_id, vehicle_id, role_in_trip } = parse(assignStaffSchema, input);
  return inTransaction(db, async (tx) => {
    await hrManager(tx, identity);
    const departure = await lockDeparture(tx, departureId);
    const vehicle = await assignments.findVehicle(tx, departureId, vehicle_id);
    if (!vehicle) throw new AppError("INVALID_INPUT", 422);
    await assertStaffEligible(tx, staff_id, role_in_trip, departure.departure_date);
    const { range } = vietnamDay(departure.departure_date);
    if (await assignments.countBusyStaff(tx, departureId, staff_id, range, closedDepartures)) throw new AppError("RESOURCE_CONFLICT", 409);
    const existing = await assignments.findStaffAssignment(tx, departureId, staff_id, role_in_trip);
    if (existing) {
      if (existing.dep_vehicle_id !== vehicle.dep_vehicle_id) throw new AppError("RESOURCE_CONFLICT", 409);
      return readAssignments(tx, departureId);
    }
    if (role_in_trip === "Driver" && await assignments.countDrivers(tx, vehicle.dep_vehicle_id)) throw new AppError("RESOURCE_CONFLICT", 409);
    await assignments.insertStaff(tx, { departure_id: departureId, staff_id, role_in_trip, dep_vehicle_id: vehicle.dep_vehicle_id });
    return readAssignments(tx, departureId);
  });
}

export async function unassignStaff(db: Database, identity: Actor, departureId: number, assignmentId: number) {
  assertId(departureId); assertId(assignmentId);
  return inTransaction(db, async (tx) => {
    await hrManager(tx, identity);
    await lockDeparture(tx, departureId);
    const assignment = await assignments.findStaffAssignmentById(tx, departureId, assignmentId);
    if (!assignment) throw new AppError("NOT_FOUND", 404);
    await assignments.lockStaff(tx, assignment.staff_id);
    await assignments.removeStaff(tx, departureId, assignmentId);
    return readAssignments(tx, departureId);
  });
}

export const assignmentService = bindDb({ listAssignments, assignVehicle, unassignVehicle, assignStaff, unassignStaff });
