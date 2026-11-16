import "server-only";
import type { DepartureStatus, Prisma } from "@/generated/prisma/client";
import type { DataClient, Transaction } from "./database";

const departureSelect = { departure_id: true, trip_id: true, departure_date: true, booking_deadline: true,
  min_passengers: true, price_override: true, status: true, is_demo: true,
  trip: { select: { base_price: true } },
  invoice_owner: { select: { user_id: true, full_name: true } },
  pickups: { select: { dep_pickup_id: true, pickup_id: true, pickup_time: true, pickup: { select: { name: true, address: true } } },
    orderBy: [{ pickup_time: "asc" }, { dep_pickup_id: "asc" }] },
} satisfies Prisma.DepartureSelect;
export type DepartureRow = Prisma.DepartureGetPayload<{ select: typeof departureSelect }>;

export function findDeparture(db: DataClient, departureId: number) {
  return db.departure.findUnique({ where: { departure_id: departureId }, select: departureSelect });
}
export async function lockDeparture(tx: Transaction, departureId: number) {
  await tx.$queryRaw`SELECT departure_id FROM departures WHERE departure_id = ${departureId} FOR UPDATE`;
  return findDeparture(tx, departureId);
}
export async function lockTrip(tx: Transaction, tripId: number) {
  const rows = await tx.$queryRaw<{ is_active: boolean }[]>`SELECT is_active FROM trips WHERE trip_id = ${tripId} FOR SHARE`;
  return rows[0] ?? null;
}
// Account access updates take a conflicting row lock, so eligibility remains stable until commit.
export async function lockUser(tx: Transaction, userId: number) {
  await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${userId} FOR SHARE`;
  return tx.user.findUnique({ where: { user_id: userId }, select: { role: true, status: true } });
}
export function countTrip(db: DataClient, tripId: number) {
  return db.trip.count({ where: { trip_id: tripId } });
}
export async function lockActivePickups(tx: Transaction, tripId: number, ids: number[]) {
  if (!ids.length) return 0;
  const sortedIds = [...ids].sort((a, b) => a - b);
  for (const id of sortedIds) await tx.$queryRaw`SELECT pickup_id FROM pickup_points WHERE pickup_id = ${id} FOR SHARE`;
  return tx.pickupPoint.count({ where: { trip_id: tripId, is_active: true, pickup_id: { in: ids } } });
}
export function createDeparture(tx: Transaction, data: Prisma.DepartureUncheckedCreateInput) {
  return tx.departure.create({ data, select: departureSelect });
}
export async function pageDepartures(db: DataClient, tripId: number, query: { status?: DepartureStatus; page: number; pageSize: number }) {
  const where = { trip_id: tripId, ...(query.status ? { status: query.status } : {}) };
  const rows = await db.departure.findMany({ where, select: departureSelect,
    orderBy: [{ departure_date: "asc" }, { departure_id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
  const totalItems = await db.departure.count({ where });
  return { rows, totalItems };
}
export function countResources(db: DataClient, departureId: number) {
  return db.departureVehicle.count({ where: { departure_id: departureId } });
}
export async function replacePickups(tx: Transaction, departureId: number, pickups: { pickup_id: number; pickup_time: Date }[]) {
  await tx.departurePickup.deleteMany({ where: { departure_id: departureId } });
  await tx.departurePickup.createMany({ data: pickups.map((item) => ({ ...item, departure_id: departureId })) });
}
export function countUnsoldSeats(db: DataClient, departureId: number) {
  return db.departureSeat.count({ where: { vehicle: { departure_id: departureId }, status: { not: "Sold" } } });
}
export function countValidTickets(db: DataClient, departureId: number) {
  return db.invoiceDetail.count({ where: { status: "Valid", seat: { vehicle: { departure_id: departureId } } } });
}
export function readSetting(db: DataClient, key: string) {
  return db.systemSetting.findUnique({ where: { setting_key: key }, select: { setting_value: true } });
}
export function updateDeparture(tx: Transaction, departureId: number, data: Prisma.DepartureUncheckedUpdateInput) {
  return tx.departure.update({ where: { departure_id: departureId }, data });
}
