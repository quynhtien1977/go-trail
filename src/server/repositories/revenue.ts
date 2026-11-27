import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { DataClient } from "./database";
import type { ReportPeriod } from "@/schemas/report";

type RevenueRow = {
  bucket: string | null; is_total: boolean;
  ticket_revenue: string; received: string; surplus: string; needs_review_amount: string;
  needs_review_count: number; pending: number; paid: number; expired: number;
};

export async function revenueReport(db: DataClient, period: ReportPeriod, group: "day" | "trip" | "departure") {
  const { start, end, tripId, departureId } = period;
  const scope = Prisma.sql`TRUE
    ${tripId === undefined ? Prisma.empty : Prisma.sql`AND d.trip_id = ${tripId}`}
    ${departureId === undefined ? Prisma.empty : Prisma.sql`AND d.departure_id = ${departureId}`}`;
  const bucket = { day: Prisma.sql`to_char(event_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')`,
    trip: Prisma.sql`trip_id::text`, departure: Prisma.sql`departure_id::text` }[group];
  // Revenue follows the first successful receipt; invoice counts use creation date and current effective status.
  const rows = await db.$queryRaw<RevenueRow[]>`
    WITH events AS (
      SELECT p.created_at AS event_at, d.trip_id, d.departure_id,
        CASE WHEN p.status = 'Success' AND i.status = 'Paid' AND p.payment_id = (
          SELECT s.payment_id FROM payments s WHERE s.invoice_id = i.invoice_id AND s.status = 'Success'
          ORDER BY s.created_at, s.payment_id LIMIT 1
        ) THEN i.total_amount ELSE 0 END AS revenue,
        CASE WHEN p.status = 'Success' THEN p.amount ELSE 0 END AS received,
        CASE WHEN p.status = 'NeedsReview' THEN p.amount ELSE 0 END AS review_amount,
        (p.status = 'NeedsReview')::int AS review_count, NULL::text AS invoice_status
      FROM payments p LEFT JOIN invoices i USING (invoice_id) LEFT JOIN departures d USING (departure_id)
      WHERE p.created_at >= ${start.toISOString()}::timestamptz AND p.created_at < ${end.toISOString()}::timestamptz AND ${scope}
      UNION ALL
      SELECT i.created_at, d.trip_id, d.departure_id, 0, 0, 0, 0,
        CASE WHEN i.status = 'Pending' AND i.expires_at <= CURRENT_TIMESTAMP
          THEN 'Expired' ELSE i.status::text END
      FROM invoices i JOIN departures d USING (departure_id)
      WHERE i.created_at >= ${start.toISOString()}::timestamptz AND i.created_at < ${end.toISOString()}::timestamptz AND ${scope}
    ), grouped AS (SELECT *, ${bucket} AS bucket FROM events)
    SELECT bucket, GROUPING(bucket) = 1 AS is_total,
      COALESCE(SUM(revenue), 0)::text AS ticket_revenue, COALESCE(SUM(received), 0)::text AS received,
      COALESCE(SUM(received - revenue), 0)::text AS surplus,
      COALESCE(SUM(review_amount), 0)::text AS needs_review_amount, COALESCE(SUM(review_count), 0)::int AS needs_review_count,
      COUNT(*) FILTER (WHERE invoice_status = 'Paid')::int AS paid,
      COUNT(*) FILTER (WHERE invoice_status = 'Pending')::int AS pending,
      COUNT(*) FILTER (WHERE invoice_status = 'Expired')::int AS expired
    FROM grouped GROUP BY GROUPING SETS ((bucket), ()) ORDER BY is_total DESC, bucket`;
  const [total, ...groups] = rows;
  const metrics = (row: RevenueRow) => ({
    ticket_revenue: row.ticket_revenue, received: row.received, surplus: row.surplus,
    needs_review_amount: row.needs_review_amount, needs_review_count: row.needs_review_count,
    pending: row.pending, paid: row.paid, expired: row.expired,
  });
  return { group_by: group, totals: metrics(total), groups: groups.map(row => ({ bucket: row.bucket, ...metrics(row) })) };
}
