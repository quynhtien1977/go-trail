import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { DataClient } from "./database";

export type TicketFilter = "valid" | "pending" | "expired";

// Allowlisted projection: no passenger phone, emergency contact, health declaration, customer or staff ids.
const ticketSelect = {
  detail_id: true, invoice_id: true, status: true, check_in_status: true, ticket_code: true,
  passenger_name: true, unit_price: true,
  seat: { select: { seat: { select: { seat_name: true } } } },
  pickup: { select: { pickup_time: true, pickup: { select: { name: true, address: true } } } },
  invoice: { select: { status: true, expires_at: true, departure_id: true, responsible_name_snapshot: true,
    departure: { select: { departure_date: true, trip: { select: { name: true } } } } } },
} satisfies Prisma.InvoiceDetailSelect;
export type TicketRow = Prisma.InvoiceDetailGetPayload<{ select: typeof ticketSelect }>;

// A Pending invoice past expires_at is shown as expired before any cleanup runs, matching the invoice DTO (K03).
function filterWhere(filter: TicketFilter | undefined, now: Date): Prisma.InvoiceDetailWhereInput {
  if (filter === "valid") return { status: "Valid", invoice: { status: "Paid" } };
  if (filter === "pending") return { status: "Pending", invoice: { status: "Pending", expires_at: { gt: now } } };
  if (filter === "expired") return { OR: [{ status: "Cancelled" }, { invoice: { status: { in: ["Expired", "Cancelled"] } } },
    { invoice: { status: "Pending", expires_at: { lte: now } } }] };
  return {};
}

// The owner is the only scope: the customer id comes from the session, never from the request.
export async function findOwnTicketsPage(db: DataClient, customerId: number,
  query: { status?: TicketFilter; page: number; pageSize: number }, now: Date) {
  const where: Prisma.InvoiceDetailWhereInput = { AND: [{ invoice: { customer_id: customerId } }, filterWhere(query.status, now)] };
  const items = await db.invoiceDetail.findMany({ where, select: ticketSelect,
    orderBy: [{ invoice: { created_at: "desc" } }, { invoice_id: "desc" }, { dep_seat_id: "asc" }],
    skip: (query.page - 1) * query.pageSize, take: query.pageSize });
  return { items, totalItems: await db.invoiceDetail.count({ where }) };
}
