import "server-only";
import type { z } from "zod";
import { inTransaction, type Database, type Transaction } from "@/server/repositories/database";
import * as catalog from "@/server/repositories/catalog";
import { catalogQuerySchema, pageQuerySchema, createTripSchema, updateTripSchema,
  createPickupSchema, updatePickupSchema, type TripDto, type TripSummaryDto,
  type DepartureDto, type Page } from "@/schemas/catalog";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}
function assertId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new AppError("INVALID_INPUT", 422);
}
function summary(row: catalog.TripSummaryRow): TripSummaryDto {
  const { media, ...fields } = row;
  return { ...fields, base_price: row.base_price.toFixed(0), length_km: row.length_km.toFixed(2),
    cover_image_url: media.find(item => item.placement === "Cover")?.storage_url ?? null };
}
function tripDto(row: catalog.TripRow): TripDto {
  return { ...summary(row), description: row.description, schedule_content: row.schedule_content,
    media: row.media.map(({ storage_url, ...item }) => ({ ...item, url: storage_url })) };
}
function page<T>(items: T[], totalItems: number, query: { page: number; pageSize: number }): Page<T> {
  return { items, pagination: { ...query, totalItems, totalPages: Math.ceil(totalItems / query.pageSize) } };
}
async function manager(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["RouteMgr"]);
  return actor;
}
async function findTrip(db: AuthDatabase, id: number, includeInactive = true) {
  const trip = await catalog.findTrip(db, id);
  if (!trip || (!includeInactive && !trip.is_active)) throw new AppError("NOT_FOUND", 404);
  return trip;
}
async function lockTrip(tx: Transaction, id: number) {
  const trip = await catalog.lockTripForUpdate(tx, id);
  if (!trip) throw new AppError("NOT_FOUND", 404);
  return trip;
}
async function listTrips(db: Database, input: unknown, identity?: Actor) {
  const query = parse(catalogQuerySchema, input);
  return inTransaction(db, async (tx) => {
    if (identity !== undefined) await manager(tx, identity);
    const result = await catalog.findTripsPage(tx, query, identity === undefined);
    return page(result.items.map(summary), result.totalItems, { page: query.page, pageSize: query.pageSize });
  }, { isolationLevel: "RepeatableRead" });
}
export async function listPublicTrips(db: Database, input: unknown = {}) { return listTrips(db, input); }
export async function listManagedTrips(db: Database, identity: Actor, input: unknown = {}) {
  // Explicitly verify null/missing identities rather than accidentally using the public path.
  await manager(db, identity);
  return listTrips(db, input, identity);
}
export async function readPublicTrip(db: Database, id: number) {
  assertId(id);
  return tripDto(await findTrip(db, id, false));
}
export async function readManagedTrip(db: Database, identity: Actor, id: number) {
  assertId(id);
  await manager(db, identity);
  return tripDto(await findTrip(db, id));
}

async function listPickups(db: Database, tripId: number, input: unknown, identity?: Actor) {
  assertId(tripId);
  const query = parse(pageQuerySchema, input);
  return inTransaction(db, async (tx) => {
    if (identity !== undefined) await manager(tx, identity);
    await findTrip(tx, tripId, identity !== undefined);
    const result = await catalog.findPickupsPage(tx, tripId, query, identity === undefined);
    return page(result.items, result.totalItems, query);
  }, { isolationLevel: "RepeatableRead" });
}
export async function listPublicPickups(db: Database, tripId: number, input: unknown = {}) { return listPickups(db, tripId, input); }
export async function listManagedPickups(db: Database, identity: Actor, tripId: number, input: unknown = {}) {
  await manager(db, identity);
  return listPickups(db, tripId, input, identity);
}
export async function listPublicDepartures(db: Database, tripId: number, input: unknown = {}, now = new Date()) {
  assertId(tripId);
  const query = parse(pageQuerySchema, input);
  return inTransaction(db, async (tx) => {
    const trip = await findTrip(tx, tripId, false);
    const result = await catalog.findPublicDeparturesPage(tx, tripId, now, query);
    const items: DepartureDto[] = result.items.map(({ price_override, ...row }) => ({ ...row, status: "Open",
      departure_date: row.departure_date.toISOString(), booking_deadline: row.booking_deadline.toISOString(),
      price: (price_override ?? trip.base_price).toFixed(0) }));
    return page(items, result.totalItems, query);
  }, { isolationLevel: "RepeatableRead" });
}

export async function createTrip(db: Database, identity: Actor, input: unknown) {
  const data = parse(createTripSchema, input);
  return inTransaction(db, async (tx) => {
    const actor = await manager(tx, identity);
    const trip = await catalog.insertTrip(tx, data);
    await writeAudit(tx, actor.user_id, { action: "TripCreated", record_id: trip.trip_id, base_price: trip.base_price.toFixed(0) });
    return tripDto(trip);
  });
}
export async function updateTrip(db: Database, identity: Actor, tripId: number, input: unknown) {
  assertId(tripId);
  const data = parse(updateTripSchema, input);
  return inTransaction(db, async (tx) => {
    const actor = await manager(tx, identity);
    const current = await lockTrip(tx, tripId);
    const updated = await catalog.updateTrip(tx, tripId, data);
    if (!current.base_price.equals(updated.base_price)) await writeAudit(tx, actor.user_id,
      { action: "TripPriceChanged", record_id: tripId, from: current.base_price.toFixed(0), to: updated.base_price.toFixed(0) });
    if (current.is_active !== updated.is_active) await writeAudit(tx, actor.user_id,
      { action: "TripAvailabilityChanged", record_id: tripId, from: current.is_active, to: updated.is_active });
    return tripDto(updated);
  });
}
export async function createPickup(db: Database, identity: Actor, tripId: number, input: unknown) {
  assertId(tripId);
  const data = parse(createPickupSchema, input);
  return inTransaction(db, async (tx) => {
    await manager(tx, identity);
    await lockTrip(tx, tripId);
    return catalog.insertPickup(tx, tripId, data);
  });
}
export async function updatePickup(db: Database, identity: Actor, tripId: number, pickupId: number, input: unknown) {
  assertId(tripId); assertId(pickupId);
  const data = parse(updatePickupSchema, input);
  return inTransaction(db, async (tx) => {
    await manager(tx, identity);
    await lockTrip(tx, tripId);
    const pickup = await catalog.findPickupForTrip(tx, tripId, pickupId);
    if (!pickup) throw new AppError("NOT_FOUND", 404);
    return catalog.updatePickup(tx, pickupId, data);
  });
}
