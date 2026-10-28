import "server-only";
import { randomBytes } from "node:crypto";
import { holdSeatsSchema, type HoldDto, type HoldSeatsInput } from "@/schemas/booking";
import { requireActor, requireRole, type Actor } from "@/server/auth/authorization";
import { AppError } from "@/server/errors";
import { inTransaction, type Database, type Transaction } from "@/server/repositories/database";
import * as bookings from "@/server/repositories/bookings";
import { bindDb } from "./bind-db";

function dto(row: bookings.HoldRow): HoldDto {
  return { invoice_id: row.invoice_id, departure_id: row.departure_id, payment_code: row.payment_code, status: row.status,
    total_amount: row.total_amount.toFixed(0), expires_at: row.expires_at.toISOString(),
    responsible_name_snapshot: row.responsible_name_snapshot, responsible_role_snapshot: row.responsible_role_snapshot,
    tickets: row.details.map(item => ({ detail_id: item.detail_id, dep_seat_id: item.dep_seat_id, dep_pickup_id: item.dep_pickup_id,
      passenger_name: item.passenger_name, seat_name: item.seat.seat.seat_name, unit_price: item.unit_price.toFixed(0) })) };
}
async function setting(tx: Transaction, key: string, fallback: number) {
  const row = await bookings.readBookingSetting(tx, key);
  const value = Number(row?.setting_value);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
function replay(row: bookings.HoldRow, departureId: number, requested: HoldSeatsInput["seats"]) {
  const same = row.departure_id === departureId && row.details.length === requested.length && row.details.every((item, index) => {
    const seat = requested[index];
    return item.dep_seat_id === seat.dep_seat_id && item.dep_pickup_id === seat.dep_pickup_id
      && item.passenger_name === seat.passenger_name && item.passenger_phone === seat.passenger_phone
      && item.emergency_contact === seat.emergency_contact && item.health_declaration === seat.health_declaration;
  });
  if (!same) throw new AppError("RESOURCE_CONFLICT", 409);
  return dto(row);
}

// Key -> departure -> trip -> users ASC -> invoices ASC -> all affected seats ASC.
// Assignment/status/account writers use conflicting locks; snapshots stay stable until commit.
export async function holdSeats(db: Database, identity: Actor, departureId: number, input: unknown, now?: Date): Promise<HoldDto> {
  if (!Number.isInteger(departureId) || departureId < 1 || departureId > 2147483647) throw new AppError("INVALID_INPUT", 422);
  const parsed = holdSeatsSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  const { idempotency_key, seats } = parsed.data;
  const requested = [...seats].sort((a, b) => a.dep_seat_id - b.dep_seat_id);
  const seatIds = requested.map(seat => seat.dep_seat_id);
  return inTransaction(db, async tx => {
    let actor = await requireActor(tx, identity);
    requireRole(actor, ["Customer"]);
    await bookings.lockHoldKey(tx, actor.user_id, idempotency_key);
    const existing = await bookings.findHoldByKey(tx, actor.user_id, idempotency_key);
    if (existing) {
      await bookings.lockBookingUsers(tx, [actor.user_id]);
      actor = await requireActor(tx, identity);
      requireRole(actor, ["Customer"]);
      return replay(existing, departureId, requested);
    }
    const departure = await bookings.lockBookingDeparture(tx, departureId);
    if (!departure) throw new AppError("NOT_FOUND", 404);
    const trip = await bookings.lockBookingTrip(tx, departure.trip_id);
    const users = await bookings.lockBookingUsers(tx, [actor.user_id,
      ...(departure.invoice_owner_user_id === null ? [] : [departure.invoice_owner_user_id])]);
    actor = await requireActor(tx, identity);
    requireRole(actor, ["Customer"]);
    const owner = users.find(user => user.user_id === departure.invoice_owner_user_id);
    if (!owner || owner.role !== "RouteMgr" || owner.status !== "Active") throw new AppError("RESOURCE_CONFLICT", 409);
    const assertOnSale = (at: Date) => {
      if (departure.status !== "Open" || departure.is_demo || !trip.is_active
        || departure.booking_deadline <= at || departure.departure_date <= at) throw new AppError("RESOURCE_CONFLICT", 409);
    };
    assertOnSale(now ?? new Date());
    if (requested.length > await setting(tx, "MAX_SEATS_PER_INVOICE", 10)) throw new AppError("INVALID_INPUT", 422);
    const ttlMinutes = await setting(tx, "SEAT_TTL_MINUTES", 15);
    const pickupIds = [...new Set(requested.map(seat => seat.dep_pickup_id))];
    if (await bookings.countBookingPickups(tx, departureId, departure.trip_id, pickupIds) !== pickupIds.length) {
      throw new AppError("INVALID_INPUT", 422);
    }
    const price = departure.price_override ?? trip.base_price;
    const invoice = await bookings.insertHoldInvoice(tx, { customer_id: actor.user_id, departure_id: departureId,
      payment_code: `GT${randomBytes(5).toString("hex").toUpperCase()}`, total_amount: price.mul(requested.length),
      status: "Pending", expires_at: new Date((now ?? new Date()).getTime() + ttlMinutes * 60_000), idempotency_key,
      responsible_user_id: owner.user_id, responsible_name_snapshot: owner.full_name, responsible_role_snapshot: "RouteMgr" });
    const oldIds = await bookings.lockSeatInvoices(tx, departureId, seatIds);
    const locked = await bookings.lockHoldSeats(tx, departureId, seatIds, oldIds);
    const mine = locked.filter(row => row.departure_id === departureId && seatIds.includes(row.dep_seat_id));
    if (mine.length !== seatIds.length) throw new AppError("INVALID_INPUT", 422);
    // Time must be evaluated after lock waits, so no new booking crosses the deadline.
    const at = now ?? new Date();
    assertOnSale(at);
    const expired = await bookings.findExpiredHolds(tx, oldIds, at);
    for (const seat of mine) {
      const reclaimable = seat.status === "Locked" && seat.locked_until !== null && seat.locked_until <= at
        && seat.invoice_id !== null && expired.includes(seat.invoice_id);
      if (seat.status !== "Available" && !reclaimable) throw new AppError("RESOURCE_CONFLICT", 409);
    }
    if (expired.length) await bookings.expireHolds(tx, expired);
    const expiresAt = new Date(at.getTime() + ttlMinutes * 60_000);
    await bookings.setHoldExpiry(tx, invoice.invoice_id, expiresAt);
    for (const seatId of seatIds) {
      if (await bookings.acquireHoldSeat(tx, departureId, seatId, invoice.invoice_id, expiresAt) !== 1) {
        throw new AppError("RESOURCE_CONFLICT", 409);
      }
    }
    await bookings.insertHoldDetails(tx, requested.map(seat => ({ ...seat, invoice_id: invoice.invoice_id, unit_price: price })));
    return dto(await bookings.findHold(tx, invoice.invoice_id));
  });
}

export const bookingService = bindDb({ holdSeats });
