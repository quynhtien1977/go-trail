import "server-only";
import type { z } from "zod";
import { inTransaction, type Database, type Transaction } from "@/server/repositories/database";
import * as departures from "@/server/repositories/departures";
import { assertConfirmingAssignments, assertOpeningAssignments } from "./assignments";
import { vietnamDay } from "./fleet";
import type { Page } from "@/schemas/catalog";
import { createDepartureSchema, departureQuerySchema, updateDepartureSchema, type ManagedDepartureDto } from "@/schemas/departure";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { bindDb } from "./bind-db";

type Schedule = { pickup_id: number; pickup_time: Date }[];
type DepartureStatus = ManagedDepartureDto["status"];
const closedDepartures = ["Ended", "Cancelled", "Rescheduled"];
// Draft -> Open runs the opening checks in updateDeparture; Running -> Ended is the Leader flow (L02).
// MVP never enters Cancelled/Rescheduled, not even for Admin (scope 17/10/2026).
const nextStatus: Partial<Record<DepartureStatus, DepartureStatus>> = { Open: "Closed", Closed: "Confirmed", Confirmed: "Running" };
const DAY_MS = 86_400_000;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}
function assertId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new AppError("INVALID_INPUT", 422);
}
function dto(row: departures.DepartureRow): ManagedDepartureDto {
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
async function lockActiveTrip(tx: Transaction, tripId: number) {
  const trip = await departures.lockTrip(tx, tripId);
  if (!trip) throw new AppError("NOT_FOUND", 404);
  if (!trip.is_active) throw new AppError("RESOURCE_CONFLICT", 409);
}

async function resolveOwner(tx: Transaction, actor: Actor, requested?: number) {
  // RouteMgr owns the Drafts they create; only Admin picks someone else.
  if (actor.role !== "Admin") {
    if (requested !== undefined && requested !== actor.user_id) throw new AppError("FORBIDDEN", 403);
    requested = actor.user_id;
  }
  if (requested === undefined) throw new AppError("INVALID_INPUT", 422);
  const owner = await departures.lockUser(tx, requested);
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
async function leaderRatio(tx: Transaction) {
  const value = Number((await departures.readSetting(tx, "LEADER_RATIO"))?.setting_value);
  return Number.isSafeInteger(value) && value > 0 ? value : 15;
}
async function assertTransition(tx: Transaction, current: departures.DepartureRow, status: DepartureStatus, now: Date) {
  if (nextStatus[current.status] !== status) throw new AppError("RESOURCE_CONFLICT", 409);
  if (status === "Closed") {
    // Sales close at the deadline, or earlier once every seat is sold; pending holds keep the departure Open.
    if (now < current.booking_deadline && await departures.countUnsoldSeats(tx, current.departure_id)) {
      throw new AppError("RESOURCE_CONFLICT", 409);
    }
  } else if (status === "Confirmed") {
    const passengers = await departures.countValidTickets(tx, current.departure_id);
    if (passengers < current.min_passengers) throw new AppError("RESOURCE_CONFLICT", 409);
    await assertConfirmingAssignments(tx, current.departure_id, current.departure_date, passengers, await leaderRatio(tx));
  } else if (now < vietnamDay(current.departure_date).range.gte) {
    // A departure starts running on its Vietnam calendar day, not earlier.
    throw new AppError("RESOURCE_CONFLICT", 409);
  }
}
async function assertTripPickups(tx: Transaction, tripId: number, schedule: Schedule) {
  if (!schedule.length) return;
  const found = await departures.lockActivePickups(tx, tripId, schedule.map((item) => item.pickup_id));
  if (found !== schedule.length) throw new AppError("INVALID_INPUT", 422);
}

export async function createDeparture(db: Database, identity: Actor, tripId: number, input: unknown, now = new Date()) {
  assertId(tripId);
  const { pickups, invoice_owner_user_id, ...data } = parse(createDepartureSchema, input);
  return inTransaction(db, async (tx) => {
    const actor = await routeManager(tx, identity);
    await lockActiveTrip(tx, tripId);
    const owner = await resolveOwner(tx, actor, invoice_owner_user_id);
    assertSchedule(data, pickups, now);
    await assertTripPickups(tx, tripId, pickups);
    const row = await departures.createDeparture(tx, { ...data, trip_id: tripId, status: "Draft", invoice_owner_user_id: owner, pickups: { create: pickups } });
    return dto(row);
  });
}

export async function listManagedDepartures(db: Database, identity: Actor, tripId: number, input: unknown = {}): Promise<Page<ManagedDepartureDto>> {
  assertId(tripId);
  const query = parse(departureQuerySchema, input);
  return inTransaction(db, async (tx) => {
    await routeManager(tx, identity);
    if (!await departures.countTrip(tx, tripId)) throw new AppError("NOT_FOUND", 404);
    const { rows, totalItems } = await departures.pageDepartures(tx, tripId, query);
    return { items: rows.map(dto), pagination: { page: query.page, pageSize: query.pageSize, totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize) } };
  }, { isolationLevel: "RepeatableRead" });
}

export async function readManagedDeparture(db: Database, identity: Actor, departureId: number) {
  assertId(departureId);
  await routeManager(db, identity);
  const row = await departures.findDeparture(db, departureId);
  if (!row) throw new AppError("NOT_FOUND", 404);
  return dto(row);
}

export async function updateDeparture(db: Database, identity: Actor, departureId: number, input: unknown, now = new Date()) {
  assertId(departureId);
  const { status, pickups, invoice_owner_user_id, ...fields } = parse(updateDepartureSchema, input);
  return inTransaction(db, async (tx) => {
    const actor = await routeManager(tx, identity);
    const current = await departures.lockDeparture(tx, departureId);
    if (!current) throw new AppError("NOT_FOUND", 404);
    if (status !== undefined && status !== "Open") {
      // Later edges only move the status; a departure on sale keeps its schedule and owner (no reschedule in MVP).
      if (invoice_owner_user_id !== undefined || pickups !== undefined || Object.values(fields).some((value) => value !== undefined)) {
        throw new AppError("INVALID_INPUT", 422);
      }
      await assertTransition(tx, current, status, now);
      await departures.updateDeparture(tx, departureId, { status });
      await writeAudit(tx, actor.user_id, { action: "DepartureStatusChanged", record_id: departureId, from: current.status, to: status });
      return dto((await departures.findDeparture(tx, departureId))!);
    }
    let owner: number | undefined;
    if (invoice_owner_user_id !== undefined) {
      // Reassignment is Admin-only and affects new invoices only; issued invoices keep their snapshot.
      if (actor.role !== "Admin") throw new AppError("FORBIDDEN", 403);
      if (closedDepartures.includes(current.status)) throw new AppError("RESOURCE_CONFLICT", 409);
      owner = await resolveOwner(tx, actor, invoice_owner_user_id);
    }
    const editing = pickups !== undefined || Object.values(fields).some((value) => value !== undefined);
    if ((editing || status) && current.status !== "Draft") throw new AppError("RESOURCE_CONFLICT", 409);
    if (fields.departure_date && fields.departure_date.getTime() !== current.departure_date.getTime()
      && await departures.countResources(tx, departureId)) throw new AppError("RESOURCE_CONFLICT", 409);
    const schedule = pickups ?? current.pickups.map(({ pickup_id, pickup_time }) => ({ pickup_id, pickup_time }));
    if (editing || status) assertSchedule({ ...current, ...fields }, schedule, now);
    // Match catalog's trip-before-pickup lock order, including combined edit-and-open requests.
    if (status === "Open") await lockActiveTrip(tx, current.trip_id);
    if (pickups) {
      await assertTripPickups(tx, current.trip_id, pickups);
      await departures.replacePickups(tx, departureId, pickups);
    }
    if (status === "Open") {
      const ownerId = owner ?? current.invoice_owner?.user_id;
      const ownerAccount = ownerId ? await departures.lockUser(tx, ownerId) : null;
      if (ownerAccount?.role !== "RouteMgr" || ownerAccount.status !== "Active") throw new AppError("RESOURCE_CONFLICT", 409);
      if (!schedule.length) throw new AppError("RESOURCE_CONFLICT", 409);
      await assertTripPickups(tx, current.trip_id, schedule);
      await assertOpeningAssignments(tx, departureId, fields.departure_date ?? current.departure_date);
    }
    await departures.updateDeparture(tx, departureId,
      { ...fields, ...(owner !== undefined ? { invoice_owner_user_id: owner } : {}), ...(status ? { status } : {}) });
    if (owner !== undefined && owner !== current.invoice_owner?.user_id) await writeAudit(tx, actor.user_id,
      { action: "DepartureOwnerChanged", record_id: departureId, from: current.invoice_owner?.user_id ?? null, to: owner });
    if (status && status !== current.status) await writeAudit(tx, actor.user_id,
      { action: "DepartureStatusChanged", record_id: departureId, from: current.status, to: status });
    return dto((await departures.findDeparture(tx, departureId))!);
  });
}

export const departureService = bindDb({ createDeparture, listManagedDepartures, readManagedDeparture, updateDeparture });
