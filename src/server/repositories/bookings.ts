import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { DataClient, Transaction } from "./database";

const holdSelect = { invoice_id: true, departure_id: true, payment_code: true, status: true, total_amount: true, expires_at: true,
  responsible_name_snapshot: true, responsible_role_snapshot: true,
  details: { orderBy: { dep_seat_id: "asc" }, select: { detail_id: true, dep_seat_id: true, dep_pickup_id: true,
    passenger_name: true, passenger_phone: true, emergency_contact: true, health_declaration: true,
    unit_price: true, seat: { select: { seat: { select: { seat_name: true } } } } } } } satisfies Prisma.InvoiceSelect;
export type HoldRow = Prisma.InvoiceGetPayload<{ select: typeof holdSelect }>;
type SeatLock = { dep_seat_id: number; departure_id: number; status: "Available" | "Locked" | "Sold";
  locked_until: Date | null; invoice_id: number | null };

// Serializes duplicate keys before resource locks; the unique index remains the durable guard.
export async function lockHoldKey(tx: Transaction, customerId: number, key: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(717025, hashtext(${`${customerId}:${key}`}))::text`;
}
export function findHoldByKey(db: DataClient, customerId: number, key: string) {
  return db.invoice.findUnique({ where: { customer_id_idempotency_key: { customer_id: customerId, idempotency_key: key } }, select: holdSelect });
}
export function findHold(db: DataClient, invoiceId: number) {
  return db.invoice.findUniqueOrThrow({ where: { invoice_id: invoiceId }, select: holdSelect });
}
export function readBookingSetting(tx: Transaction, key: string) {
  return tx.systemSetting.findUnique({ where: { setting_key: key }, select: { setting_value: true } });
}
export async function lockBookingDeparture(tx: Transaction, id: number) {
  await tx.$queryRaw`SELECT departure_id FROM departures WHERE departure_id = ${id} FOR SHARE`;
  return tx.departure.findUnique({ where: { departure_id: id }, select: { trip_id: true, status: true, is_demo: true,
    booking_deadline: true, departure_date: true, invoice_owner_user_id: true, price_override: true } });
}
export async function lockBookingTrip(tx: Transaction, id: number) {
  await tx.$queryRaw`SELECT trip_id FROM trips WHERE trip_id = ${id} FOR SHARE`;
  return tx.trip.findUniqueOrThrow({ where: { trip_id: id }, select: { is_active: true, base_price: true } });
}
export function lockBookingUsers(tx: Transaction, ids: number[]) {
  return tx.$queryRaw<{ user_id: number; full_name: string; role: string; status: string }[]>`
    SELECT user_id, full_name, role::text AS role, status::text AS status FROM users
    WHERE user_id IN (${Prisma.join([...new Set(ids)])}) ORDER BY user_id FOR SHARE`;
}
export function countBookingPickups(tx: Transaction, departureId: number, tripId: number, ids: number[]) {
  return tx.departurePickup.count({ where: { departure_id: departureId, dep_pickup_id: { in: ids },
    pickup: { trip_id: tripId, is_active: true } } });
}
export function insertHoldInvoice(tx: Transaction, data: Prisma.InvoiceUncheckedCreateInput) {
  return tx.invoice.create({ data, select: { invoice_id: true } });
}
export async function lockSeatInvoices(tx: Transaction, departureId: number, seatIds: number[]) {
  const rows = await tx.departureSeat.findMany({ where: { vehicle: { departure_id: departureId },
    dep_seat_id: { in: seatIds }, status: "Locked", invoice: { departure_id: departureId } },
    select: { invoice_id: true }, distinct: ["invoice_id"] });
  const ids = rows.flatMap(row => row.invoice_id === null ? [] : [row.invoice_id]).sort((a, b) => a - b);
  if (ids.length) await tx.$queryRaw`SELECT invoice_id FROM invoices WHERE invoice_id IN (${Prisma.join(ids)}) ORDER BY invoice_id FOR UPDATE`;
  return ids;
}
export function lockHoldSeats(tx: Transaction, departureId: number, seatIds: number[], invoiceIds: number[]) {
  return tx.$queryRaw<SeatLock[]>`
    SELECT ds.dep_seat_id, dv.departure_id, ds.status::text AS status, ds.locked_until, ds.invoice_id
    FROM departure_seats ds JOIN departure_vehicles dv ON dv.dep_vehicle_id = ds.dep_vehicle_id
    WHERE (dv.departure_id = ${departureId} AND ds.dep_seat_id IN (${Prisma.join(seatIds)}))
      ${invoiceIds.length ? Prisma.sql`OR ds.invoice_id IN (${Prisma.join(invoiceIds)})` : Prisma.empty}
    ORDER BY ds.dep_seat_id FOR UPDATE OF ds`;
}
export async function findExpiredHolds(tx: Transaction, ids: number[], now: Date) {
  const rows = await tx.invoice.findMany({ where: { invoice_id: { in: ids }, status: "Pending", expires_at: { lte: now },
    details: { none: { status: "Valid" } }, seats: { none: { status: "Sold" } } }, select: { invoice_id: true } });
  return rows.map(row => row.invoice_id);
}
export async function expireHolds(tx: Transaction, ids: number[]) {
  await tx.invoice.updateMany({ where: { invoice_id: { in: ids }, status: "Pending" }, data: { status: "Expired" } });
  await tx.invoiceDetail.updateMany({ where: { invoice_id: { in: ids }, status: "Pending" }, data: { status: "Cancelled" } });
  await tx.departureSeat.updateMany({ where: { invoice_id: { in: ids }, status: "Locked" },
    data: { status: "Available", invoice_id: null, locked_until: null } });
}
export function setHoldExpiry(tx: Transaction, invoiceId: number, expiresAt: Date) {
  return tx.invoice.update({ where: { invoice_id: invoiceId }, data: { expires_at: expiresAt } });
}
export function acquireHoldSeat(tx: Transaction, departureId: number, seatId: number, invoiceId: number, expiresAt: Date) {
  return tx.$executeRaw`UPDATE departure_seats ds SET status = 'Locked', invoice_id = ${invoiceId}, locked_until = ${expiresAt}
    FROM departure_vehicles dv WHERE ds.dep_vehicle_id = dv.dep_vehicle_id AND dv.departure_id = ${departureId}
      AND ds.dep_seat_id = ${seatId} AND ds.status = 'Available'`;
}
export function insertHoldDetails(tx: Transaction, data: Prisma.InvoiceDetailCreateManyInput[]) {
  return tx.invoiceDetail.createMany({ data });
}
