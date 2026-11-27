import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { ReportPeriod } from "@/schemas/report";
import type { Transaction } from "./database";
import { stockDelta } from "./inventory";

function departureFilter(period: ReportPeriod, owner?: number) {
  return Prisma.sql`TRUE
    ${owner === undefined ? Prisma.empty : Prisma.sql`AND d.invoice_owner_user_id = ${owner}`}
    ${period.tripId === undefined ? Prisma.empty : Prisma.sql`AND d.trip_id = ${period.tripId}`}
    ${period.departureId === undefined ? Prisma.empty : Prisma.sql`AND d.departure_id = ${period.departureId}`}`;
}

export async function operations(db: Transaction, period: ReportPeriod, owner?: number) {
  const eligible = Prisma.sql`SELECT d.departure_id FROM departures d WHERE ${departureFilter(period, owner)}
    AND d.departure_date >= ${period.start.toISOString()}::timestamptz AND d.departure_date < ${period.end.toISOString()}::timestamptz`;
  const [counts] = await db.$queryRaw<{ departures: number; vehicles: number; staff: number; seats: number; seats_sold: number }[]>`
    WITH scope AS (${eligible}), vehicles AS (SELECT v.* FROM departure_vehicles v JOIN scope USING (departure_id))
    SELECT (SELECT COUNT(*) FROM scope)::int AS departures,
      (SELECT COUNT(DISTINCT vehicle_id) FROM vehicles)::int AS vehicles,
      (SELECT COUNT(DISTINCT staff_id) FROM departure_staff JOIN scope USING (departure_id))::int AS staff,
      COUNT(s.dep_seat_id)::int AS seats, COUNT(*) FILTER (WHERE s.status = 'Sold')::int AS seats_sold
    FROM departure_seats s JOIN vehicles USING (dep_vehicle_id)`;
  return counts;
}

export async function passengers(db: Transaction, period: ReportPeriod, owner?: number) {
  const [counts] = await db.$queryRaw<{ bookers: number; valid_tickets: number; checked_in: number }[]>`
    SELECT COUNT(DISTINCT i.customer_id)::int AS bookers, COUNT(*)::int AS valid_tickets,
      COUNT(*) FILTER (WHERE t.check_in_status = 'CheckedIn')::int AS checked_in
    FROM departures d JOIN invoices i USING (departure_id) JOIN invoice_details t USING (invoice_id)
    WHERE ${departureFilter(period, owner)} AND i.status = 'Paid' AND t.status = 'Valid'
    AND d.departure_date >= ${period.start.toISOString()}::timestamptz AND d.departure_date < ${period.end.toISOString()}::timestamptz`;
  return counts;
}

export function periodSupplies(db: Transaction, period: ReportPeriod, after: number, owner?: number) {
  return db.$queryRaw<{ item_id: number; name: string; unit: string; issued: number; returned: number }[]>`
    SELECT i.item_id, i.name, i.unit,
      SUM(CASE WHEN t.txn_type = 'Issue' THEN t.quantity ELSE 0 END)::int AS issued,
      SUM(CASE WHEN t.txn_type = 'Return' THEN t.quantity ELSE 0 END)::int AS returned
    FROM supply_transactions t JOIN departures d USING (departure_id) JOIN supply_items i USING (item_id)
    WHERE ${departureFilter(period, owner)} AND i.item_id > ${after}
    AND t.created_at >= ${period.start.toISOString()}::timestamptz AND t.created_at < ${period.end.toISOString()}::timestamptz
    GROUP BY i.item_id ORDER BY i.item_id LIMIT 51`;
}

export function lowStock(db: Transaction, after: number) {
  return db.$queryRaw<{ item_id: number; name: string; unit: string; low_stock_threshold: number | null; on_hand: number }[]>`
    SELECT i.item_id, i.name, i.unit, i.low_stock_threshold, COALESCE(SUM(${stockDelta}), 0)::int AS on_hand
    FROM supply_items i LEFT JOIN supply_transactions t USING (item_id)
    WHERE i.is_active AND i.item_id > ${after}
    GROUP BY i.item_id HAVING COALESCE(SUM(${stockDelta}), 0) <= COALESCE(i.low_stock_threshold, 0) ORDER BY i.item_id LIMIT 51`;
}
