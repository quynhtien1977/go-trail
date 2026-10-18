import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { holdSeatsSchema, type HoldDto } from "@/schemas/booking";
import { requireActor, requireRole, type Actor } from "@/server/auth/authorization";
import { AppError } from "@/server/errors";

const holdSelect = { invoice_id: true, departure_id: true, payment_code: true, status: true, total_amount: true, expires_at: true,
  details: { orderBy: { dep_seat_id: "asc" }, select: { detail_id: true, dep_seat_id: true, dep_pickup_id: true, passenger_name: true,
    unit_price: true, seat: { select: { seat: { select: { seat_name: true } } } } } } } satisfies Prisma.InvoiceSelect;
type HoldRow = Prisma.InvoiceGetPayload<{ select: typeof holdSelect }>;
type SeatLock = { dep_seat_id: number; status: "Available" | "Locked" | "Sold"; locked_until: Date | null; invoice_id: number | null };

function dto(row: HoldRow): HoldDto {
  return { invoice_id: row.invoice_id, departure_id: row.departure_id, payment_code: row.payment_code, status: row.status,
    total_amount: row.total_amount.toFixed(0), expires_at: row.expires_at.toISOString(),
    tickets: row.details.map(({ seat, unit_price, ...item }) => ({ ...item, seat_name: seat.seat.seat_name, unit_price: unit_price.toFixed(0) })) };
}
async function setting(tx: Prisma.TransactionClient, key: string, fallback: number) {
  const row = await tx.systemSetting.findUnique({ where: { setting_key: key }, select: { setting_value: true } });
  const value = Number(row?.setting_value);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
// Same key + same seats replays the original invoice; same key for anything else is a client bug.
async function replay(db: Prisma.TransactionClient | PrismaClient, customerId: number, key: string, departureId: number, seatIds: number[]) {
  const existing = await db.invoice.findUnique({ where: { customer_id_idempotency_key: { customer_id: customerId, idempotency_key: key } },
    select: holdSelect });
  if (!existing) return null;
  const same = existing.departure_id === departureId && existing.details.length === seatIds.length
    && existing.details.every((item, index) => item.dep_seat_id === seatIds[index]);
  if (!same) throw new AppError("RESOURCE_CONFLICT", 409);
  return dto(existing);
}

/**
 * Holds several seats and creates their Pending invoice atomically.
 * Lock order (shared with assignment, owner and payment writers): departure -> owner user -> invoices -> seats by dep_seat_id ASC.
 */
export async function holdSeats(db: PrismaClient, identity: Actor, departureId: number, input: unknown, now = new Date()): Promise<HoldDto> {
  if (!Number.isInteger(departureId) || departureId < 1 || departureId > 2147483647) throw new AppError("INVALID_INPUT", 422);
  const parsed = holdSeatsSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  const { idempotency_key, seats } = parsed.data;
  const requested = [...seats].sort((a, b) => a.dep_seat_id - b.dep_seat_id);
  const seatIds = requested.map((seat) => seat.dep_seat_id);
  try {
    return await db.$transaction(async (tx) => {
      const actor = await requireActor(tx, identity);
      requireRole(actor, ["Customer"]);
      const replayed = await replay(tx, actor.user_id, idempotency_key, departureId, seatIds);
      if (replayed) return replayed;
      if (requested.length > await setting(tx, "MAX_SEATS_PER_INVOICE", 10)) throw new AppError("INVALID_INPUT", 422);
      const ttlMinutes = await setting(tx, "SEAT_TTL_MINUTES", 15);

      // FOR SHARE blocks a concurrent owner reassignment or status change until this hold commits.
      const [departure] = await tx.$queryRaw<{ status: string; is_demo: boolean; booking_deadline: Date; invoice_owner_user_id: number | null;
        price: Prisma.Decimal; trip_active: boolean }[]>`
        SELECT d.status, d.is_demo, d.booking_deadline, d.invoice_owner_user_id,
               COALESCE(d.price_override, t.base_price) AS price, t.is_active AS trip_active
        FROM departures d JOIN trips t ON t.trip_id = d.trip_id WHERE d.departure_id = ${departureId} FOR SHARE OF d`;
      if (!departure) throw new AppError("NOT_FOUND", 404);
      // Demo departures are never sold for real.
      if (departure.status !== "Open" || departure.is_demo || !departure.trip_active || departure.booking_deadline <= now) {
        throw new AppError("RESOURCE_CONFLICT", 409);
      }
      // Customers never choose staff: the owner comes from the departure only, locked against account changes.
      const [owner] = departure.invoice_owner_user_id === null ? [] : await tx.$queryRaw<{ user_id: number; full_name: string; role: string; status: string }[]>`
        SELECT user_id, full_name, role::text AS role, status::text AS status FROM users WHERE user_id = ${departure.invoice_owner_user_id} FOR SHARE`;
      if (!owner || owner.role !== "RouteMgr" || owner.status !== "Active") throw new AppError("RESOURCE_CONFLICT", 409);
      const pickups = await tx.departurePickup.count({ where: { departure_id: departureId,
        dep_pickup_id: { in: [...new Set(requested.map((seat) => seat.dep_pickup_id))] } } });
      if (pickups !== new Set(requested.map((seat) => seat.dep_pickup_id)).size) throw new AppError("INVALID_INPUT", 422);

      const price = new Prisma.Decimal(departure.price);
      const expires_at = new Date(now.getTime() + ttlMinutes * 60_000);
      // Invoice first, so every seat lock below can point at it.
      const invoice = await tx.invoice.create({ data: { customer_id: actor.user_id, departure_id: departureId,
        payment_code: `GT${randomBytes(5).toString("hex").toUpperCase()}`, total_amount: price.mul(requested.length),
        status: "Pending", expires_at, idempotency_key, responsible_user_id: owner.user_id,
        responsible_name_snapshot: owner.full_name, responsible_role_snapshot: "RouteMgr" }, select: { invoice_id: true } });

      // Holds that already expired may be reclaimed; find their invoices so all their seats are locked in one ordered pass.
      const stale = await tx.departureSeat.findMany({ where: { dep_seat_id: { in: seatIds }, status: "Locked",
        locked_until: { lte: now }, invoice: { status: "Pending", expires_at: { lte: now } } }, select: { invoice_id: true }, distinct: ["invoice_id"] });
      const staleIds = stale.map((row) => row.invoice_id!).sort((a, b) => a - b);
      if (staleIds.length) await tx.$queryRaw`SELECT invoice_id FROM invoices WHERE invoice_id IN (${Prisma.join(staleIds)}) ORDER BY invoice_id FOR UPDATE`;
      const locked = await tx.$queryRaw<SeatLock[]>`
        SELECT ds.dep_seat_id, ds.status::text AS status, ds.locked_until, ds.invoice_id
        FROM departure_seats ds JOIN departure_vehicles dv ON dv.dep_vehicle_id = ds.dep_vehicle_id
        WHERE (dv.departure_id = ${departureId} AND ds.dep_seat_id IN (${Prisma.join(seatIds)}))
           ${staleIds.length ? Prisma.sql`OR ds.invoice_id IN (${Prisma.join(staleIds)})` : Prisma.empty}
        ORDER BY ds.dep_seat_id FOR UPDATE OF ds`;
      const mine = locked.filter((row) => seatIds.includes(row.dep_seat_id));
      if (mine.length !== seatIds.length) throw new AppError("INVALID_INPUT", 422);

      const expired = await tx.invoice.findMany({ where: { invoice_id: { in: staleIds }, status: "Pending", expires_at: { lte: now } },
        select: { invoice_id: true } }).then((rows) => rows.map((row) => row.invoice_id));
      for (const seat of mine) {
        const reclaimable = seat.status === "Locked" && seat.locked_until !== null && seat.locked_until <= now
          && seat.invoice_id !== null && expired.includes(seat.invoice_id);
        // Sold, or held by a live or already-paid invoice: the whole hold rolls back.
        if (seat.status !== "Available" && !reclaimable) throw new AppError("RESOURCE_CONFLICT", 409);
      }
      if (expired.length) {
        // Only expired Pending holds are released; Paid/Valid/Sold are never touched here.
        await tx.invoice.updateMany({ where: { invoice_id: { in: expired } }, data: { status: "Expired" } });
        await tx.invoiceDetail.updateMany({ where: { invoice_id: { in: expired }, status: "Pending" }, data: { status: "Cancelled" } });
        await tx.departureSeat.updateMany({ where: { invoice_id: { in: expired }, status: "Locked" },
          data: { status: "Available", invoice_id: null, locked_until: null } });
      }
      await tx.departureSeat.updateMany({ where: { dep_seat_id: { in: seatIds } },
        data: { status: "Locked", invoice_id: invoice.invoice_id, locked_until: expires_at } });
      await tx.invoiceDetail.createMany({ data: requested.map(({ dep_seat_id, dep_pickup_id, passenger_name, passenger_phone,
        emergency_contact, health_declaration }) => ({ invoice_id: invoice.invoice_id, dep_seat_id, dep_pickup_id, passenger_name,
        passenger_phone, emergency_contact, health_declaration, unit_price: price })) });
      return dto(await tx.invoice.findUniqueOrThrow({ where: { invoice_id: invoice.invoice_id }, select: holdSelect }));
    });
  } catch (error) {
    // Two concurrent requests with one key: the loser replays the winner's committed invoice.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const actor = await requireActor(db, identity);
      const replayed = await replay(db, actor.user_id, idempotency_key, departureId, seatIds);
      if (replayed) return replayed;
    }
    throw error;
  }
}
