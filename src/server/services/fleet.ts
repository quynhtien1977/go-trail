import "server-only";
import type { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { pageQuerySchema, type Page } from "@/schemas/catalog";
import { createMaintenanceSchema, createSeatSchema, createVehicleSchema, updateSeatSchema, updateVehicleSchema,
  vehicleQuerySchema, type MaintenanceDto, type SeatDto, type VehicleDto, type VehicleSummaryDto } from "@/schemas/fleet";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";

const seatSelect = { seat_id: true, vehicle_id: true, seat_name: true, floor_level: true,
  x_position: true, y_position: true, is_active: true } as const;
const summarySelect = { vehicle_id: true, plate_number: true, vehicle_type: true, seat_count: true, status: true } as const;
const vehicleSelect = { ...summarySelect, seats: { select: seatSelect,
  orderBy: [{ floor_level: "asc" }, { y_position: "asc" }, { x_position: "asc" }, { seat_id: "asc" }] } } satisfies Prisma.VehicleSelect;
const maintenanceSelect = { maintenance_id: true, vehicle_id: true, start_date: true, end_date: true,
  description: true, cost: true } as const;
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
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new AppError("RESOURCE_CONFLICT", 409);
  throw error;
}
function page<T>(items: T[], totalItems: number, query: { page: number; pageSize: number }): Page<T> {
  return { items, pagination: { ...query, totalItems, totalPages: Math.ceil(totalItems / query.pageSize) } };
}
// Asia/Ho_Chi_Minh has no DST, so a fixed +07:00 offset maps instants to local calendar days exactly.
const localDay = (instant: Date) => new Date(instant.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const dayStart = (day: string) => new Date(`${day}T00:00:00+07:00`);
export const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
/** The local (Vietnam) calendar day of an instant: its @db.Date value and its [start, end) instants. */
export function vietnamDay(instant: Date) {
  const day = localDay(instant);
  return { date: dbDate(day), range: { gte: dayStart(day), lt: new Date(dayStart(day).getTime() + DAY_MS) } };
}
function maintenanceDto(row: Prisma.VehicleMaintenanceGetPayload<{ select: typeof maintenanceSelect }>): MaintenanceDto {
  return { ...row, start_date: row.start_date.toISOString().slice(0, 10), end_date: row.end_date.toISOString().slice(0, 10),
    cost: row.cost.toFixed(0) };
}

async function fleetManager(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["HRMgr"]);
  return actor;
}
async function lockVehicle(tx: Prisma.TransactionClient, id: number) {
  // Serializes layout, status, maintenance and assignment checks for one vehicle.
  const rows = await tx.$queryRaw<{ vehicle_id: number }[]>`SELECT vehicle_id FROM vehicles WHERE vehicle_id = ${id} FOR UPDATE`;
  if (!rows.length) throw new AppError("NOT_FOUND", 404);
  return tx.vehicle.findUniqueOrThrow({ where: { vehicle_id: id }, select: vehicleSelect });
}
function openAssignments(tx: Prisma.TransactionClient, vehicleId: number, range?: { gte: Date; lt: Date }) {
  return tx.departureVehicle.count({ where: { vehicle_id: vehicleId,
    departure: { status: { notIn: [...closedDepartures] }, ...(range ? { departure_date: range } : {}) } } });
}
async function assertLayoutEditable(tx: Prisma.TransactionClient, vehicleId: number) {
  // Departure seats were generated from this layout; editing it mid-trip would desync tickets.
  if (await openAssignments(tx, vehicleId)) throw new AppError("RESOURCE_CONFLICT", 409);
}
async function assertFreePosition(tx: Prisma.TransactionClient, vehicleId: number,
  seat: { floor_level: number; x_position: number; y_position: number }, exceptSeatId?: number) {
  const taken = await tx.vehicleSeat.findFirst({ where: { vehicle_id: vehicleId, is_active: true,
    floor_level: seat.floor_level, x_position: seat.x_position, y_position: seat.y_position,
    ...(exceptSeatId ? { seat_id: { not: exceptSeatId } } : {}) }, select: { seat_id: true } });
  if (taken) throw new AppError("RESOURCE_CONFLICT", 409);
}
async function syncSeatCount(tx: Prisma.TransactionClient, vehicleId: number) {
  const seat_count = await tx.vehicleSeat.count({ where: { vehicle_id: vehicleId, is_active: true } });
  if (seat_count < 1) throw new AppError("RESOURCE_CONFLICT", 409);
  await tx.vehicle.update({ where: { vehicle_id: vehicleId }, data: { seat_count } });
}

export async function listVehicles(db: PrismaClient, identity: Actor, input: unknown = {}): Promise<Page<VehicleSummaryDto>> {
  const query = parse(vehicleQuerySchema, input);
  return db.$transaction(async (tx) => {
    await fleetManager(tx, identity);
    const where = query.status ? { status: query.status } : {};
    const items = await tx.vehicle.findMany({ where, select: summarySelect, orderBy: { vehicle_id: "asc" },
      skip: (query.page - 1) * query.pageSize, take: query.pageSize });
    return page(items, await tx.vehicle.count({ where }), { page: query.page, pageSize: query.pageSize });
  }, { isolationLevel: "RepeatableRead" });
}
export async function readVehicle(db: PrismaClient, identity: Actor, vehicleId: number): Promise<VehicleDto> {
  assertId(vehicleId);
  await fleetManager(db, identity);
  const vehicle = await db.vehicle.findUnique({ where: { vehicle_id: vehicleId }, select: vehicleSelect });
  if (!vehicle) throw new AppError("NOT_FOUND", 404);
  return vehicle;
}
export async function createVehicle(db: PrismaClient, identity: Actor, input: unknown): Promise<VehicleDto> {
  const { seats, ...data } = parse(createVehicleSchema, input);
  return db.$transaction(async (tx) => {
    await fleetManager(tx, identity);
    return tx.vehicle.create({ data: { ...data, seat_count: seats.length, seats: { create: seats } }, select: vehicleSelect });
  }).catch(uniqueConflict);
}
export async function updateVehicle(db: PrismaClient, identity: Actor, vehicleId: number, input: unknown): Promise<VehicleDto> {
  assertId(vehicleId);
  const data = parse(updateVehicleSchema, input);
  return db.$transaction(async (tx) => {
    const actor = await fleetManager(tx, identity);
    const current = await lockVehicle(tx, vehicleId);
    const status = data.status ?? current.status;
    if (status !== current.status && status !== "Ready" && await openAssignments(tx, vehicleId)) {
      throw new AppError("VEHICLE_UNAVAILABLE", 409);
    }
    const updated = await tx.vehicle.update({ where: { vehicle_id: vehicleId }, data, select: vehicleSelect });
    if (status !== current.status) await writeAudit(tx, actor.user_id,
      { action: "VehicleStatusChanged", record_id: vehicleId, from: current.status, to: status });
    return updated;
  }).catch(uniqueConflict);
}

export async function addSeat(db: PrismaClient, identity: Actor, vehicleId: number, input: unknown): Promise<SeatDto> {
  assertId(vehicleId);
  const data = parse(createSeatSchema, input);
  return db.$transaction(async (tx) => {
    await fleetManager(tx, identity);
    await lockVehicle(tx, vehicleId);
    await assertLayoutEditable(tx, vehicleId);
    await assertFreePosition(tx, vehicleId, data);
    const seat = await tx.vehicleSeat.create({ data: { ...data, vehicle_id: vehicleId }, select: seatSelect });
    await syncSeatCount(tx, vehicleId);
    return seat;
  }).catch(uniqueConflict);
}
export async function updateSeat(db: PrismaClient, identity: Actor, vehicleId: number, seatId: number, input: unknown): Promise<SeatDto> {
  assertId(vehicleId); assertId(seatId);
  const data = parse(updateSeatSchema, input);
  return db.$transaction(async (tx) => {
    await fleetManager(tx, identity);
    await lockVehicle(tx, vehicleId);
    // Scoping by vehicle_id stops a seat of another vehicle being edited through this vehicle's URL.
    const current = await tx.vehicleSeat.findFirst({ where: { seat_id: seatId, vehicle_id: vehicleId }, select: seatSelect });
    if (!current) throw new AppError("NOT_FOUND", 404);
    await assertLayoutEditable(tx, vehicleId);
    const next = { ...current, ...data };
    if (next.is_active) await assertFreePosition(tx, vehicleId, next, seatId);
    const seat = await tx.vehicleSeat.update({ where: { seat_id: seatId }, data, select: seatSelect });
    await syncSeatCount(tx, vehicleId);
    return seat;
  }).catch(uniqueConflict);
}

export async function listMaintenance(db: PrismaClient, identity: Actor, vehicleId: number, input: unknown = {}): Promise<Page<MaintenanceDto>> {
  assertId(vehicleId);
  const query = parse(pageQuerySchema, input);
  return db.$transaction(async (tx) => {
    await fleetManager(tx, identity);
    if (!await tx.vehicle.count({ where: { vehicle_id: vehicleId } })) throw new AppError("NOT_FOUND", 404);
    const where = { vehicle_id: vehicleId };
    const rows = await tx.vehicleMaintenance.findMany({ where, select: maintenanceSelect,
      orderBy: [{ start_date: "desc" }, { maintenance_id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
    return page(rows.map(maintenanceDto), await tx.vehicleMaintenance.count({ where }), query);
  }, { isolationLevel: "RepeatableRead" });
}
// Maintenance records are append-only so the vehicle's history is kept.
export async function createMaintenance(db: PrismaClient, identity: Actor, vehicleId: number, input: unknown): Promise<MaintenanceDto> {
  assertId(vehicleId);
  const data = parse(createMaintenanceSchema, input);
  return db.$transaction(async (tx) => {
    const actor = await fleetManager(tx, identity);
    await lockVehicle(tx, vehicleId);
    const range = { gte: dayStart(data.start_date), lt: new Date(dayStart(data.end_date).getTime() + DAY_MS) };
    if (await openAssignments(tx, vehicleId, range)) throw new AppError("VEHICLE_UNAVAILABLE", 409);
    const row = await tx.vehicleMaintenance.create({ data: { ...data, vehicle_id: vehicleId,
      start_date: dbDate(data.start_date), end_date: dbDate(data.end_date) }, select: maintenanceSelect });
    await writeAudit(tx, actor.user_id, { action: "MoneyRecorded", record_id: row.maintenance_id,
      table_name: "vehicle_maintenance", amount: row.cost.toFixed(0) });
    return maintenanceDto(row);
  });
}

// Departure assignment (O04) must call this inside its transaction before inserting departure_vehicles.
// shortcut: departures store only a start instant, so only that local day is checked; add an end date for multi-day trips.
export async function assertVehicleAssignable(tx: Prisma.TransactionClient, vehicleId: number, departureDate: Date,
  departureId?: number) {
  assertId(vehicleId);
  const vehicle = await lockVehicle(tx, vehicleId);
  if (vehicle.status !== "Ready") throw new AppError("VEHICLE_UNAVAILABLE", 409);
  const { date, range } = vietnamDay(departureDate);
  const blocked = await tx.vehicleMaintenance.count({ where: { vehicle_id: vehicleId,
    start_date: { lte: date }, end_date: { gte: date } } });
  // The same vehicle cannot serve two open departures on one local day.
  const busy = await tx.departureVehicle.count({ where: { vehicle_id: vehicleId,
    departure: { departure_id: { not: departureId }, status: { notIn: [...closedDepartures] }, departure_date: range } } });
  if (blocked || busy) throw new AppError("VEHICLE_UNAVAILABLE", 409);
  return vehicle;
}
