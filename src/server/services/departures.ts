import "server-only";
import type { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { Page } from "@/schemas/catalog";
import { createDepartureSchema, departureQuerySchema, updateDepartureSchema, type ManagedDepartureDto } from "@/schemas/departure";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";

const departureSelect = { departure_id: true, trip_id: true, departure_date: true, booking_deadline: true,
  min_passengers: true, price_override: true, status: true, is_demo: true,
  trip: { select: { base_price: true } },
  invoice_owner: { select: { user_id: true, full_name: true } },
  pickups: { select: { dep_pickup_id: true, pickup_id: true, pickup_time: true, pickup: { select: { name: true, address: true } } },
    orderBy: [{ pickup_time: "asc" }, { dep_pickup_id: "asc" }] },
} satisfies Prisma.DepartureSelect;
type DepartureRow = Prisma.DepartureGetPayload<{ select: typeof departureSelect }>;
type Schedule = { pickup_id: number; pickup_time: Date }[];
const closedDepartures = ["Ended", "Cancelled", "Rescheduled"];
const DAY_MS = 86_400_000;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}
function assertId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new AppError("INVALID_INPUT", 422);
}
function dto(row: DepartureRow): ManagedDepartureDto {
  const { trip, pickups, ...fields } = row;
  return { ...fields, departure_date: row.departure_date.toISOString(), booking_deadline: row.booking_deadline.toISOString(),
    price_override: row.price_override?.toFixed(0) ?? null, price: (row.price_override ?? trip.base_price).toFixed(0),
    pickups: pickups.map(({ pickup, ...item }) => ({ ...item, ...pickup, pickup_time: item.pickup_time.toISOString() })) };
}

async function routeManager(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["RouteMgr"]);
  return actor;
}
async function lockActiveTrip(tx: Prisma.TransactionClient, tripId: number) {
  // FOR SHARE matches the departures_active_trip_check trigger and blocks a concurrent retirement.
  const rows = await tx.$queryRaw<{ is_active: boolean }[]>`SELECT is_active FROM trips WHERE trip_id = ${tripId} FOR SHARE`;
  if (!rows.length) throw new AppError("NOT_FOUND", 404);
  if (!rows[0].is_active) throw new AppError("RESOURCE_CONFLICT", 409);
}
async function resolveOwner(tx: Prisma.TransactionClient, actor: Actor, requested?: number) {
  // RouteMgr owns the Drafts they create; only Admin picks someone else.
  if (actor.role !== "Admin") {
    if (requested !== undefined && requested !== actor.user_id) throw new AppError("FORBIDDEN", 403);
    return actor.user_id;
  }
  if (requested === undefined) throw new AppError("INVALID_INPUT", 422);
  const owner = await tx.user.findUnique({ where: { user_id: requested }, select: { role: true, status: true } });
  if (owner?.role !== "RouteMgr" || owner.status !== "Active") throw new AppError("INVALID_INPUT", 422);
  return requested;
}
function assertSchedule(dates: { departure_date: Date; booking_deadline: Date }, schedule: Schedule, now: Date) {
  if (dates.booking_deadline <= now || dates.booking_deadline > dates.departure_date) throw new AppError("INVALID_INPUT", 422);
  // Pickups happen after sales close and around the departure, never on another day's trip.
  for (const item of schedule) {
    if (item.pickup_time < dates.booking_deadline
      || Math.abs(item.pickup_time.getTime() - dates.departure_date.getTime()) > DAY_MS) throw new AppError("INVALID_INPUT", 422);
  }
}
async function assertTripPickups(tx: Prisma.TransactionClient, tripId: number, schedule: Schedule) {
  if (!schedule.length) return;
  const found = await tx.pickupPoint.count({ where: { trip_id: tripId, is_active: true,
    pickup_id: { in: schedule.map((item) => item.pickup_id) } } });
  if (found !== schedule.length) throw new AppError("INVALID_INPUT", 422);
}
function findDeparture(db: AuthDatabase, departureId: number) {
  return db.departure.findUnique({ where: { departure_id: departureId }, select: departureSelect });
}

export async function createDeparture(db: PrismaClient, identity: Actor, tripId: number, input: unknown, now = new Date()) {
  assertId(tripId);
  const { pickups, invoice_owner_user_id, ...data } = parse(createDepartureSchema, input);
  return db.$transaction(async (tx) => {
    const actor = await routeManager(tx, identity);
    await lockActiveTrip(tx, tripId);
    const owner = await resolveOwner(tx, actor, invoice_owner_user_id);
    assertSchedule(data, pickups, now);
    await assertTripPickups(tx, tripId, pickups);
    const row = await tx.departure.create({ data: { ...data, trip_id: tripId, status: "Draft", invoice_owner_user_id: owner,
      pickups: { create: pickups } }, select: departureSelect });
    return dto(row);
  });
}

export async function listManagedDepartures(db: PrismaClient, identity: Actor, tripId: number, input: unknown = {}): Promise<Page<ManagedDepartureDto>> {
  assertId(tripId);
  const query = parse(departureQuerySchema, input);
  return db.$transaction(async (tx) => {
    await routeManager(tx, identity);
    if (!await tx.trip.count({ where: { trip_id: tripId } })) throw new AppError("NOT_FOUND", 404);
    const where = { trip_id: tripId, ...(query.status ? { status: query.status } : {}) };
    const rows = await tx.departure.findMany({ where, select: departureSelect,
      orderBy: [{ departure_date: "asc" }, { departure_id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
    const totalItems = await tx.departure.count({ where });
    return { items: rows.map(dto), pagination: { page: query.page, pageSize: query.pageSize, totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize) } };
  }, { isolationLevel: "RepeatableRead" });
}

export async function readManagedDeparture(db: PrismaClient, identity: Actor, departureId: number) {
  assertId(departureId);
  await routeManager(db, identity);
  const row = await findDeparture(db, departureId);
  if (!row) throw new AppError("NOT_FOUND", 404);
  return dto(row);
}

export async function updateDeparture(db: PrismaClient, identity: Actor, departureId: number, input: unknown, now = new Date()) {
  assertId(departureId);
  const { status, pickups, invoice_owner_user_id, ...fields } = parse(updateDepartureSchema, input);
  return db.$transaction(async (tx) => {
    const actor = await routeManager(tx, identity);
    const locked = await tx.$queryRaw<{ departure_id: number }[]>`SELECT departure_id FROM departures WHERE departure_id = ${departureId} FOR UPDATE`;
    if (!locked.length) throw new AppError("NOT_FOUND", 404);
    const current = (await findDeparture(tx, departureId))!;
    let owner: number | undefined;
    if (invoice_owner_user_id !== undefined) {
      // Reassignment is Admin-only and affects new invoices only; issued invoices keep their snapshot.
      if (actor.role !== "Admin") throw new AppError("FORBIDDEN", 403);
      if (closedDepartures.includes(current.status)) throw new AppError("RESOURCE_CONFLICT", 409);
      owner = await resolveOwner(tx, actor, invoice_owner_user_id);
    }
    const editing = pickups !== undefined || Object.values(fields).some((value) => value !== undefined);
    if ((editing || status) && current.status !== "Draft") throw new AppError("RESOURCE_CONFLICT", 409);
    const schedule = pickups ?? current.pickups.map(({ pickup_id, pickup_time }) => ({ pickup_id, pickup_time }));
    if (editing || status) assertSchedule({ ...current, ...fields }, schedule, now);
    if (pickups) {
      await assertTripPickups(tx, current.trip_id, pickups);
      // Draft departures have no invoices, so their pickup schedule can be replaced wholesale.
      await tx.departurePickup.deleteMany({ where: { departure_id: departureId } });
      await tx.departurePickup.createMany({ data: pickups.map((item) => ({ ...item, departure_id: departureId })) });
    }
    if (status === "Open") {
      await lockActiveTrip(tx, current.trip_id);
      // Selling needs pickups and at least one assigned vehicle with generated seats (O04).
      const seats = await tx.departureSeat.count({ where: { vehicle: { departure_id: departureId } } });
      if (!schedule.length || !seats) throw new AppError("RESOURCE_CONFLICT", 409);
    }
    await tx.departure.update({ where: { departure_id: departureId },
      data: { ...fields, ...(owner !== undefined ? { invoice_owner_user_id: owner } : {}), ...(status ? { status } : {}) } });
    if (owner !== undefined && owner !== current.invoice_owner?.user_id) await writeAudit(tx, actor.user_id,
      { action: "DepartureOwnerChanged", record_id: departureId, from: current.invoice_owner?.user_id ?? null, to: owner });
    if (status && status !== current.status) await writeAudit(tx, actor.user_id,
      { action: "DepartureStatusChanged", record_id: departureId, from: current.status, to: status });
    return dto((await findDeparture(tx, departureId))!);
  });
}
