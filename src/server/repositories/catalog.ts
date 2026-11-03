import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { z } from "zod";
import type { catalogQuerySchema, TripInput, TripPatch, PickupDto } from "@/schemas/catalog";
import type { DataClient } from "./database";

const summarySelect = { trip_id: true, name: true, city: true, district: true, location_name: true,
  difficulty_level: true, length_km: true, peak_height_m: true, base_price: true, source_url: true, is_active: true,
  media: { where: { placement: "Cover", is_active: true }, select: { placement: true, storage_url: true }, take: 1 } } as const;
const tripSelect = { ...summarySelect, description: true, schedule_content: true,
  media: { where: { is_active: true }, orderBy: [{ placement: "asc" }, { sort_order: "asc" }],
    select: { media_id: true, placement: true, sort_order: true, storage_url: true, alt_text: true, caption: true, title: true, body: true } } } satisfies Prisma.TripSelect;
const pickupSelect = { pickup_id: true, trip_id: true, name: true, address: true, is_active: true } as const;
type TripSummaryRow = Prisma.TripGetPayload<{ select: typeof summarySelect }>;
type TripRow = Prisma.TripGetPayload<{ select: typeof tripSelect }>;
export type { TripSummaryRow, TripRow };

export function findTrip(db: DataClient, id: number) {
  return db.trip.findUnique({ where: { trip_id: id }, select: tripSelect });
}

export async function lockTripForUpdate(tx: Prisma.TransactionClient, id: number) {
  // Serializes catalog edits so price audit's "from" value matches the committed predecessor.
  const rows = await tx.$queryRaw<{ trip_id: number }[]>`SELECT trip_id FROM trips WHERE trip_id = ${id} FOR UPDATE`;
  if (!rows.length) return null;
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

export async function findTripsPage(db: DataClient, query: z.infer<typeof catalogQuerySchema>, publicOnly: boolean) {
  const where = { ...tripFilter(query), ...(publicOnly ? { is_active: true } : {}) };
  const items = await db.trip.findMany({ where, select: summarySelect, orderBy: { trip_id: "asc" },
    skip: (query.page - 1) * query.pageSize, take: query.pageSize });
  return { items, totalItems: await db.trip.count({ where }) };
}

export async function findPickupsPage(db: DataClient, tripId: number, query: { page: number; pageSize: number }, publicOnly: boolean) {
  const where = { trip_id: tripId, ...(publicOnly ? { is_active: true } : {}) };
  const items = await db.pickupPoint.findMany({ where, select: pickupSelect, orderBy: { pickup_id: "asc" },
    skip: (query.page - 1) * query.pageSize, take: query.pageSize });
  return { items, totalItems: await db.pickupPoint.count({ where }) };
}

export async function findPublicDeparturesPage(db: DataClient, tripId: number, now: Date, query: { page: number; pageSize: number }) {
  const where = { trip_id: tripId, status: "Open" as const, is_demo: false, departure_date: { gt: now }, booking_deadline: { gt: now } };
  const items = await db.departure.findMany({ where,
    orderBy: [{ departure_date: "asc" }, { departure_id: "asc" }],
    select: { departure_id: true, trip_id: true, departure_date: true, booking_deadline: true,
      min_passengers: true, price_override: true },
    skip: (query.page - 1) * query.pageSize, take: query.pageSize });
  return { items, totalItems: await db.departure.count({ where }) };
}

export function insertTrip(db: DataClient, data: TripInput) {
  return db.trip.create({ data, select: tripSelect });
}

export function updateTrip(db: DataClient, tripId: number, data: TripPatch) {
  return db.trip.update({ where: { trip_id: tripId }, data, select: tripSelect });
}

export function insertPickup(db: DataClient, tripId: number, data: Pick<PickupDto, "name" | "address">) {
  return db.pickupPoint.create({ data: { ...data, trip_id: tripId }, select: pickupSelect });
}

export function findPickupForTrip(db: DataClient, tripId: number, pickupId: number) {
  return db.pickupPoint.findFirst({ where: { pickup_id: pickupId, trip_id: tripId }, select: { pickup_id: true } });
}

export function updatePickup(db: DataClient, pickupId: number, data: Partial<Pick<PickupDto, "name" | "address" | "is_active">>) {
  return db.pickupPoint.update({ where: { pickup_id: pickupId }, data, select: pickupSelect });
}
