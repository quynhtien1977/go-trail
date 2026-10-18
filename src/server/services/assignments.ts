import "server-only";
import type { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { assignStaffSchema, assignVehicleSchema, type AssignmentDto } from "@/schemas/assignment";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { AppError } from "@/server/errors";
import { assertVehicleAssignable, vietnamDay } from "./fleet";

// Running/Ended trips keep their crew and seats; MVP has no cancel or reschedule.
const assignableStatuses = ["Draft", "Open", "Closed", "Confirmed"];
const closedDepartures = ["Ended", "Cancelled", "Rescheduled"] as const;
const assignmentSelect = { departure_id: true, status: true,
  vehicles: { orderBy: { dep_vehicle_id: "asc" }, select: { dep_vehicle_id: true, vehicle_id: true,
    vehicle: { select: { plate_number: true, seat_count: true } }, _count: { select: { seats: true } },
    staff: { orderBy: { dep_staff_id: "asc" }, select: { dep_staff_id: true, staff_id: true, role_in_trip: true,
      staff: { select: { full_name: true } } } } } },
} satisfies Prisma.DepartureSelect;

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
// Lock order for every assignment write: departure row, then vehicle row (inside assertVehicleAssignable).
async function lockDeparture(tx: Prisma.TransactionClient, departureId: number) {
  const rows = await tx.$queryRaw<{ departure_id: number }[]>`SELECT departure_id FROM departures WHERE departure_id = ${departureId} FOR UPDATE`;
  if (!rows.length) throw new AppError("NOT_FOUND", 404);
  const departure = await tx.departure.findUniqueOrThrow({ where: { departure_id: departureId },
    select: { departure_id: true, departure_date: true, status: true } });
  if (!assignableStatuses.includes(departure.status)) throw new AppError("RESOURCE_CONFLICT", 409);
  return departure;
}
async function readAssignments(db: AuthDatabase, departureId: number): Promise<AssignmentDto> {
  const row = await db.departure.findUnique({ where: { departure_id: departureId }, select: assignmentSelect });
  if (!row) throw new AppError("NOT_FOUND", 404);
  return { departure_id: row.departure_id, status: row.status, vehicles: row.vehicles.map((item) => ({
    dep_vehicle_id: item.dep_vehicle_id, vehicle_id: item.vehicle_id, plate_number: item.vehicle.plate_number,
    seat_count: item.vehicle.seat_count, generated_seats: item._count.seats,
    staff: item.staff.map(({ staff, ...rest }) => ({ ...rest, full_name: staff.full_name })) })) };
}

export async function listAssignments(db: PrismaClient, identity: Actor, departureId: number) {
  assertId(departureId);
  await hrManager(db, identity);
  return readAssignments(db, departureId);
}

export async function assignVehicle(db: PrismaClient, identity: Actor, departureId: number, input: unknown) {
  assertId(departureId);
  const { vehicle_id } = parse(assignVehicleSchema, input);
  return db.$transaction(async (tx) => {
    await hrManager(tx, identity);
    const departure = await lockDeparture(tx, departureId);
    const vehicle = await assertVehicleAssignable(tx, vehicle_id, departure.departure_date, departureId);
    // Retrying the same assignment returns the existing row instead of a second vehicle or duplicate seats.
    const assignment = await tx.departureVehicle.upsert({ where: { departure_id_vehicle_id: { departure_id: departureId, vehicle_id } },
      create: { departure_id: departureId, vehicle_id }, update: {}, select: { dep_vehicle_id: true } });
    await tx.departureSeat.createMany({ skipDuplicates: true, data: vehicle.seats.filter((seat) => seat.is_active)
      .map((seat) => ({ dep_vehicle_id: assignment.dep_vehicle_id, seat_id: seat.seat_id })) });
    return readAssignments(tx, departureId);
  });
}

export async function unassignVehicle(db: PrismaClient, identity: Actor, departureId: number, vehicleId: number) {
  assertId(departureId); assertId(vehicleId);
  return db.$transaction(async (tx) => {
    await hrManager(tx, identity);
    const departure = await lockDeparture(tx, departureId);
    const assignment = await tx.departureVehicle.findUnique({ where: { departure_id_vehicle_id: { departure_id: departureId, vehicle_id: vehicleId } },
      select: { dep_vehicle_id: true } });
    if (!assignment) throw new AppError("NOT_FOUND", 404);
    // Held or sold seats, or any ticket history, pin the vehicle to this departure.
    const used = await tx.departureSeat.count({ where: { dep_vehicle_id: assignment.dep_vehicle_id,
      OR: [{ status: { not: "Available" } }, { tickets: { some: {} } }] } });
    const remaining = await tx.departureVehicle.count({ where: { departure_id: departureId } });
    if (used || (departure.status !== "Draft" && remaining <= 1)) throw new AppError("RESOURCE_CONFLICT", 409);
    await tx.departureStaff.deleteMany({ where: { dep_vehicle_id: assignment.dep_vehicle_id } });
    await tx.departureSeat.deleteMany({ where: { dep_vehicle_id: assignment.dep_vehicle_id } });
    await tx.departureVehicle.delete({ where: { dep_vehicle_id: assignment.dep_vehicle_id } });
    return readAssignments(tx, departureId);
  });
}

export async function assignStaff(db: PrismaClient, identity: Actor, departureId: number, input: unknown) {
  assertId(departureId);
  const { staff_id, vehicle_id, role_in_trip } = parse(assignStaffSchema, input);
  return db.$transaction(async (tx) => {
    await hrManager(tx, identity);
    const departure = await lockDeparture(tx, departureId);
    const vehicle = await tx.departureVehicle.findUnique({ where: { departure_id_vehicle_id: { departure_id: departureId, vehicle_id } },
      select: { dep_vehicle_id: true } });
    if (!vehicle) throw new AppError("INVALID_INPUT", 422);
    const staff = await tx.staff.findUnique({ where: { staff_id },
      select: { staff_type: true, status: true, license_number: true, license_expiry: true, user: { select: { role: true, status: true } } } });
    if (!staff) throw new AppError("NOT_FOUND", 404);
    const { date, range } = vietnamDay(departure.departure_date);
    // Driver/Assistant are personnel without logins; only a Leader needs an Active Leader account for check-in.
    const qualified = staff.status === "Active" && staff.staff_type === role_in_trip
      && (role_in_trip !== "Driver" || (!!staff.license_number && !!staff.license_expiry && staff.license_expiry >= date))
      && (role_in_trip !== "Leader" || (staff.user?.role === "Leader" && staff.user.status === "Active"));
    if (!qualified) throw new AppError("ACCESS_CONFLICT", 409);
    const existing = await tx.departureStaff.findUnique({ where: { departure_id_staff_id_role_in_trip: { departure_id: departureId, staff_id, role_in_trip } },
      select: { dep_vehicle_id: true } });
    if (existing) {
      if (existing.dep_vehicle_id !== vehicle.dep_vehicle_id) throw new AppError("RESOURCE_CONFLICT", 409);
      return readAssignments(tx, departureId);
    }
    const busy = await tx.departureStaff.count({ where: { staff_id,
      departure: { departure_id: { not: departureId }, status: { notIn: [...closedDepartures] }, departure_date: range } } });
    const driverTaken = role_in_trip === "Driver"
      && await tx.departureStaff.count({ where: { dep_vehicle_id: vehicle.dep_vehicle_id, role_in_trip: "Driver" } });
    if (busy || driverTaken) throw new AppError("RESOURCE_CONFLICT", 409);
    await tx.departureStaff.create({ data: { departure_id: departureId, staff_id, role_in_trip, dep_vehicle_id: vehicle.dep_vehicle_id } });
    return readAssignments(tx, departureId);
  });
}

export async function unassignStaff(db: PrismaClient, identity: Actor, departureId: number, assignmentId: number) {
  assertId(departureId); assertId(assignmentId);
  return db.$transaction(async (tx) => {
    await hrManager(tx, identity);
    await lockDeparture(tx, departureId);
    const deleted = await tx.departureStaff.deleteMany({ where: { dep_staff_id: assignmentId, departure_id: departureId } });
    if (!deleted.count) throw new AppError("NOT_FOUND", 404);
    return readAssignments(tx, departureId);
  });
}
