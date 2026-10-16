import "server-only";
import type { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { catalogQuerySchema, pageQuerySchema, createTripSchema, updateTripSchema,
  createPickupSchema, updatePickupSchema, type TripDto, type TripSummaryDto, type PickupDto,
  type DepartureDto, type Page } from "@/schemas/catalog";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";

const summarySelect = { trip_id: true, name: true, city: true, district: true, location_name: true,
  difficulty_level: true, length_km: true, peak_height_m: true, base_price: true, source_url: true, is_active: true,
  media: { where: { placement: "Cover", is_active: true }, select: { placement: true, storage_url: true }, take: 1 } } as const;
const tripSelect = { ...summarySelect, description: true, schedule_content: true,
  media: { where: { is_active: true }, orderBy: [{ placement: "asc" }, { sort_order: "asc" }],
    select: { media_id: true, placement: true, sort_order: true, storage_url: true, alt_text: true, caption: true, title: true, body: true } } } satisfies Prisma.TripSelect;
const pickupSelect = { pickup_id: true, trip_id: true, name: true, address: true, is_active: true } as const;
type TripSummaryRow = Prisma.TripGetPayload<{ select: typeof summarySelect }>;
type TripRow = Prisma.TripGetPayload<{ select: typeof tripSelect }>;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}
function assertId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new AppError("INVALID_INPUT", 422);
}
function summary(row: TripSummaryRow): TripSummaryDto {
  const { media, ...fields } = row;
  return { ...fields, base_price: row.base_price.toFixed(0), length_km: row.length_km.toFixed(2),
    cover_image_url: media.find(item => item.placement === "Cover")?.storage_url ?? null };
}
function tripDto(row: TripRow): TripDto {
  return { ...summary(row), description: row.description, schedule_content: row.schedule_content,
    media: row.media.map(({ storage_url, ...item }) => ({ ...item, url: storage_url })) };
}
function page<T>(items: T[], totalItems: number, query: { page: number; pageSize: number }): Page<T> {
  return { items, pagination: { ...query, totalItems, totalPages: Math.ceil(totalItems / query.pageSize) } };
}
function paging(query: { page: number; pageSize: number }) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }
async function manager(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["RouteMgr"]);
  return actor;
}
async function findTrip(db: AuthDatabase, id: number, includeInactive = true) {
  const trip = await db.trip.findUnique({ where: { trip_id: id }, select: tripSelect });
  if (!trip || (!includeInactive && !trip.is_active)) throw new AppError("NOT_FOUND", 404);
  return trip;
}
async function lockTrip(tx: Prisma.TransactionClient, id: number) {
  // Serializes catalog edits so price audit's "from" value matches the committed predecessor.
  const rows = await tx.$queryRaw<{ trip_id: number }[]>`SELECT trip_id FROM trips WHERE trip_id = ${id} FOR UPDATE`;
  if (!rows.length) throw new AppError("NOT_FOUND", 404);
  return findTrip(tx, id);
}
function tripFilter(query: z.infer<typeof catalogQuerySchema>): Prisma.TripWhereInput {
  // Prisma LIKE filters treat %/_ as wildcards; catalog search is a literal substring.
  const search = query.q?.replace(/[\\%_]/g, "\\$&");
  const city = query.city?.replace(/[\\%_]/g, "\\$&");
  return { ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } },
      { location_name: { contains: search, mode: "insensitive" } }] } : {}) };
}

async function listTrips(db: PrismaClient, input: unknown, identity?: Actor) {
  const query = parse(catalogQuerySchema, input);
  return db.$transaction(async (tx) => {
    if (identity !== undefined) await manager(tx, identity);
    const where = { ...tripFilter(query), ...(identity === undefined ? { is_active: true } : {}) };
    const items = await tx.trip.findMany({ where, select: summarySelect, orderBy: { trip_id: "asc" }, ...paging(query) });
    return page(items.map(summary), await tx.trip.count({ where }), { page: query.page, pageSize: query.pageSize });
  }, { isolationLevel: "RepeatableRead" });
}
export async function listPublicTrips(db: PrismaClient, input: unknown = {}) { return listTrips(db, input); }
export async function listManagedTrips(db: PrismaClient, identity: Actor, input: unknown = {}) {
  // Explicitly verify null/missing identities rather than accidentally using the public path.
  await manager(db, identity);
  return listTrips(db, input, identity);
}
export async function readPublicTrip(db: PrismaClient, id: number) {
  assertId(id);
  return tripDto(await findTrip(db, id, false));
}
export async function readManagedTrip(db: PrismaClient, identity: Actor, id: number) {
  assertId(id);
  await manager(db, identity);
  return tripDto(await findTrip(db, id));
}

async function listPickups(db: PrismaClient, tripId: number, input: unknown, identity?: Actor) {
  assertId(tripId);
  const query = parse(pageQuerySchema, input);
  return db.$transaction(async (tx) => {
    if (identity !== undefined) await manager(tx, identity);
    await findTrip(tx, tripId, identity !== undefined);
    const where = { trip_id: tripId, ...(identity === undefined ? { is_active: true } : {}) };
    const items = await tx.pickupPoint.findMany({ where, select: pickupSelect, orderBy: { pickup_id: "asc" }, ...paging(query) });
    return page<PickupDto>(items, await tx.pickupPoint.count({ where }), query);
  }, { isolationLevel: "RepeatableRead" });
}
export async function listPublicPickups(db: PrismaClient, tripId: number, input: unknown = {}) { return listPickups(db, tripId, input); }
export async function listManagedPickups(db: PrismaClient, identity: Actor, tripId: number, input: unknown = {}) {
  await manager(db, identity);
  return listPickups(db, tripId, input, identity);
}
export async function listPublicDepartures(db: PrismaClient, tripId: number, input: unknown = {}, now = new Date()) {
  assertId(tripId);
  const query = parse(pageQuerySchema, input);
  return db.$transaction(async (tx) => {
    const trip = await findTrip(tx, tripId, false);
    const where = { trip_id: tripId, status: "Open" as const, is_demo: false, booking_deadline: { gt: now }, departure_date: { gt: now } };
    const rows = await tx.departure.findMany({ where, select: { departure_id: true, trip_id: true, departure_date: true,
      booking_deadline: true, min_passengers: true, price_override: true },
      orderBy: [{ departure_date: "asc" }, { departure_id: "asc" }], ...paging(query) });
    const items: DepartureDto[] = rows.map(({ price_override, ...row }) => ({ ...row, status: "Open",
      departure_date: row.departure_date.toISOString(), booking_deadline: row.booking_deadline.toISOString(),
      price: (price_override ?? trip.base_price).toFixed(0) }));
    return page(items, await tx.departure.count({ where }), query);
  }, { isolationLevel: "RepeatableRead" });
}

export async function createTrip(db: PrismaClient, identity: Actor, input: unknown) {
  const data = parse(createTripSchema, input);
  return db.$transaction(async (tx) => {
    const actor = await manager(tx, identity);
    const trip = await tx.trip.create({ data, select: tripSelect });
    await writeAudit(tx, actor.user_id, { action: "TripCreated", record_id: trip.trip_id, base_price: trip.base_price.toFixed(0) });
    return tripDto(trip);
  });
}
export async function updateTrip(db: PrismaClient, identity: Actor, tripId: number, input: unknown) {
  assertId(tripId);
  const data = parse(updateTripSchema, input);
  return db.$transaction(async (tx) => {
    const actor = await manager(tx, identity);
    const current = await lockTrip(tx, tripId);
    const updated = await tx.trip.update({ where: { trip_id: tripId }, data, select: tripSelect });
    if (!current.base_price.equals(updated.base_price)) await writeAudit(tx, actor.user_id,
      { action: "TripPriceChanged", record_id: tripId, from: current.base_price.toFixed(0), to: updated.base_price.toFixed(0) });
    if (current.is_active !== updated.is_active) await writeAudit(tx, actor.user_id,
      { action: "TripAvailabilityChanged", record_id: tripId, from: current.is_active, to: updated.is_active });
    return tripDto(updated);
  });
}
export async function createPickup(db: PrismaClient, identity: Actor, tripId: number, input: unknown) {
  assertId(tripId);
  const data = parse(createPickupSchema, input);
  return db.$transaction(async (tx) => {
    await manager(tx, identity);
    await lockTrip(tx, tripId);
    return tx.pickupPoint.create({ data: { ...data, trip_id: tripId }, select: pickupSelect });
  });
}
export async function updatePickup(db: PrismaClient, identity: Actor, tripId: number, pickupId: number, input: unknown) {
  assertId(tripId); assertId(pickupId);
  const data = parse(updatePickupSchema, input);
  return db.$transaction(async (tx) => {
    await manager(tx, identity);
    await lockTrip(tx, tripId);
    const pickup = await tx.pickupPoint.findFirst({ where: { pickup_id: pickupId, trip_id: tripId }, select: { pickup_id: true } });
    if (!pickup) throw new AppError("NOT_FOUND", 404);
    return tx.pickupPoint.update({ where: { pickup_id: pickupId }, data, select: pickupSelect });
  });
}
