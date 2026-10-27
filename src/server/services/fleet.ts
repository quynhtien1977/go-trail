import "server-only";
import type { z } from "zod";
import { inTransaction, type Database, type Transaction } from "@/server/repositories/database";
import * as fleet from "@/server/repositories/fleet";
import { pageQuerySchema, type Page } from "@/schemas/catalog";
import { createMaintenanceSchema, createSeatSchema, createVehicleSchema, updateSeatSchema, updateVehicleSchema,
  vehicleQuerySchema, type MaintenanceDto, type SeatDto, type VehicleDto, type VehicleSummaryDto } from "@/schemas/fleet";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { bindDb } from "./bind-db";

// A vehicle on any departure outside these statuses is still committed to that trip.
const closedDepartures = ["Ended", "Cancelled", "Rescheduled"] as const;
const DAY_MS = 86_400_000;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}
function assertId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new AppError("INVALID_INPUT", 422);
}
function uniqueConflict(error: unknown): never {
  if (fleet.isUniqueConflict(error)) throw new AppError("RESOURCE_CONFLICT", 409);
  throw error;
}
function page<T>(items: T[], totalItems: number, query: { page: number; pageSize: number }): Page<T> {
  return { items, pagination: { ...query, totalItems, totalPages: Math.ceil(totalItems / query.pageSize) } };
}
// Asia/Ho_Chi_Minh has no DST, so a fixed +07:00 offset maps instants to local calendar days exactly.
const localDay = (instant: Date) => new Date(instant.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const dayStart = (day: string) => new Date(`${day}T00:00:00+07:00`);
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
function maintenanceDto(row: fleet.MaintenanceRow): MaintenanceDto {
  return { ...row, start_date: row.start_date.toISOString().slice(0, 10), end_date: row.end_date.toISOString().slice(0, 10),
    cost: row.cost.toFixed(0) };
}

async function fleetManager(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["HRMgr"]);
  return actor;
}
async function lockVehicle(tx: Transaction, id: number) {
  const vehicle = await fleet.lockVehicleForUpdate(tx, id);
  if (!vehicle) throw new AppError("NOT_FOUND", 404);
  return vehicle;
}
function openAssignments(tx: Transaction, vehicleId: number, range?: { gte: Date; lt: Date }) {
  return fleet.countAssignments(tx, vehicleId, closedDepartures, range);
}
async function assertLayoutEditable(tx: Transaction, vehicleId: number) {
  // Departure seats were generated from this layout; editing it mid-trip would desync tickets.
  if (await openAssignments(tx, vehicleId)) throw new AppError("RESOURCE_CONFLICT", 409);
}
async function assertFreePosition(tx: Transaction, vehicleId: number,
  seat: { floor_level: number; x_position: number; y_position: number }, exceptSeatId?: number) {
  const taken = await fleet.findSeatAtPosition(tx, vehicleId, seat, exceptSeatId);
  if (taken) throw new AppError("RESOURCE_CONFLICT", 409);
}
async function syncSeatCount(tx: Transaction, vehicleId: number) {
  const seat_count = await fleet.countActiveSeats(tx, vehicleId);
  if (seat_count < 1) throw new AppError("RESOURCE_CONFLICT", 409);
  await fleet.setSeatCount(tx, vehicleId, seat_count);
}

export async function listVehicles(db: Database, identity: Actor, input: unknown = {}): Promise<Page<VehicleSummaryDto>> {
  const query = parse(vehicleQuerySchema, input);
  return inTransaction(db, async (tx) => {
    await fleetManager(tx, identity);
    const result = await fleet.findVehiclesPage(tx, query);
    return page(result.items, result.totalItems, { page: query.page, pageSize: query.pageSize });
  }, { isolationLevel: "RepeatableRead" });
}
export async function readVehicle(db: Database, identity: Actor, vehicleId: number): Promise<VehicleDto> {
  assertId(vehicleId);
  await fleetManager(db, identity);
  const vehicle = await fleet.findVehicle(db, vehicleId);
  if (!vehicle) throw new AppError("NOT_FOUND", 404);
  return vehicle;
}
export async function createVehicle(db: Database, identity: Actor, input: unknown): Promise<VehicleDto> {
  const { seats, ...data } = parse(createVehicleSchema, input);
  return inTransaction(db, async (tx) => {
    await fleetManager(tx, identity);
    return fleet.insertVehicle(tx, data, seats);
  }).catch(uniqueConflict);
}
export async function updateVehicle(db: Database, identity: Actor, vehicleId: number, input: unknown): Promise<VehicleDto> {
  assertId(vehicleId);
  const data = parse(updateVehicleSchema, input);
  return inTransaction(db, async (tx) => {
    const actor = await fleetManager(tx, identity);
    const current = await lockVehicle(tx, vehicleId);
    const status = data.status ?? current.status;
    if (status !== current.status && status !== "Ready" && await openAssignments(tx, vehicleId)) {
      throw new AppError("VEHICLE_UNAVAILABLE", 409);
    }
    const updated = await fleet.updateVehicle(tx, vehicleId, data);
    if (status !== current.status) await writeAudit(tx, actor.user_id,
      { action: "VehicleStatusChanged", record_id: vehicleId, from: current.status, to: status });
    return updated;
  }).catch(uniqueConflict);
}

// Vehicles are referenced by departures and maintenance history, so delete deactivates.
export function deactivateVehicle(db: Database, identity: Actor, vehicleId: number): Promise<VehicleDto> {
  return updateVehicle(db, identity, vehicleId, { status: "Inactive" });
}

export async function addSeat(db: Database, identity: Actor, vehicleId: number, input: unknown): Promise<SeatDto> {
  assertId(vehicleId);
  const data = parse(createSeatSchema, input);
  return inTransaction(db, async (tx) => {
    await fleetManager(tx, identity);
    await lockVehicle(tx, vehicleId);
    await assertLayoutEditable(tx, vehicleId);
    await assertFreePosition(tx, vehicleId, data);
    const seat = await fleet.insertSeat(tx, vehicleId, data);
    await syncSeatCount(tx, vehicleId);
    return seat;
  }).catch(uniqueConflict);
}
export async function updateSeat(db: Database, identity: Actor, vehicleId: number, seatId: number, input: unknown): Promise<SeatDto> {
  assertId(vehicleId); assertId(seatId);
  const data = parse(updateSeatSchema, input);
  return inTransaction(db, async (tx) => {
    await fleetManager(tx, identity);
    await lockVehicle(tx, vehicleId);
    // Scoping by vehicle_id stops a seat of another vehicle being edited through this vehicle's URL.
    const current = await fleet.findSeatForVehicle(tx, vehicleId, seatId);
    if (!current) throw new AppError("NOT_FOUND", 404);
    await assertLayoutEditable(tx, vehicleId);
    const next = { ...current, ...data };
    if (next.is_active) await assertFreePosition(tx, vehicleId, next, seatId);
    const seat = await fleet.updateSeat(tx, seatId, data);
    await syncSeatCount(tx, vehicleId);
    return seat;
  }).catch(uniqueConflict);
}

// Departure seats keep referencing old seats, so delete deactivates.
export function deactivateSeat(db: Database, identity: Actor, vehicleId: number, seatId: number): Promise<SeatDto> {
  return updateSeat(db, identity, vehicleId, seatId, { is_active: false });
}

export async function listMaintenance(db: Database, identity: Actor, vehicleId: number, input: unknown = {}): Promise<Page<MaintenanceDto>> {
  assertId(vehicleId);
  const query = parse(pageQuerySchema, input);
  return inTransaction(db, async (tx) => {
    await fleetManager(tx, identity);
    if (!await fleet.countVehicle(tx, vehicleId)) throw new AppError("NOT_FOUND", 404);
    const result = await fleet.findMaintenancePage(tx, vehicleId, query);
    return page(result.items.map(maintenanceDto), result.totalItems, query);
  }, { isolationLevel: "RepeatableRead" });
}
// Maintenance records are append-only so the vehicle's history is kept.
export async function createMaintenance(db: Database, identity: Actor, vehicleId: number, input: unknown): Promise<MaintenanceDto> {
  assertId(vehicleId);
  const data = parse(createMaintenanceSchema, input);
  return inTransaction(db, async (tx) => {
    const actor = await fleetManager(tx, identity);
    await lockVehicle(tx, vehicleId);
    const range = { gte: dayStart(data.start_date), lt: new Date(dayStart(data.end_date).getTime() + DAY_MS) };
    if (await openAssignments(tx, vehicleId, range)) throw new AppError("VEHICLE_UNAVAILABLE", 409);
    const row = await fleet.insertMaintenance(tx, vehicleId, { ...data,
      start_date: dbDate(data.start_date), end_date: dbDate(data.end_date) });
    await writeAudit(tx, actor.user_id, { action: "MoneyRecorded", record_id: row.maintenance_id,
      table_name: "vehicle_maintenance", amount: row.cost.toFixed(0) });
    return maintenanceDto(row);
  });
}

// Departure assignment (O04) must call this inside its transaction before inserting departure_vehicles.
// shortcut: departures store only a start instant, so only that local day is checked; add an end date for multi-day trips.
export async function assertVehicleAssignable(tx: Transaction, vehicleId: number, departureDate: Date) {
  assertId(vehicleId);
  const vehicle = await lockVehicle(tx, vehicleId);
  if (vehicle.status !== "Ready") throw new AppError("VEHICLE_UNAVAILABLE", 409);
  const day = dbDate(localDay(departureDate));
  const blocked = await fleet.countMaintenanceOnDay(tx, vehicleId, day);
  if (blocked) throw new AppError("VEHICLE_UNAVAILABLE", 409);
  return vehicle;
}

export const fleetService = bindDb({ listVehicles, readVehicle, createVehicle, updateVehicle, deactivateVehicle,
  addSeat, updateSeat, deactivateSeat, listMaintenance, createMaintenance });
