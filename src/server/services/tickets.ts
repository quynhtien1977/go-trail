import "server-only";
import { inTransaction, type Database } from "@/server/repositories/database";
import * as tickets from "@/server/repositories/tickets";
import type { Page } from "@/schemas/catalog";
import { ticketQuerySchema, type TicketDto } from "@/schemas/ticket";
import { requireActor, requireRole, type Actor } from "@/server/auth/authorization";
import { AppError } from "@/server/errors";
import { bindDb } from "./bind-db";

function ticket(row: tickets.TicketRow, at: Date): TicketDto {
  // Issued means confirmed by P02: a Paid invoice and a Valid ticket. Anything else never exposes a code.
  const issued = row.invoice.status === "Paid" && row.status === "Valid" && row.ticket_code?.trim() ? row.ticket_code : null;
  // Same rule and same instant as the repository's `expired` filter, so a listed ticket never contradicts its filter.
  const holdExpired = row.invoice.status === "Expired" || (row.invoice.status === "Pending" && row.invoice.expires_at <= at);
  return { detail_id: row.detail_id, invoice_id: row.invoice_id, invoice_status: row.invoice.status,
    invoice_expires_at: row.invoice.expires_at.toISOString(), hold_expired: holdExpired,
    status: row.status, check_in_status: row.check_in_status,
    ticket_code: issued, trip_name: row.invoice.departure.trip.name, departure_id: row.invoice.departure_id,
    departure_date: row.invoice.departure.departure_date.toISOString(), passenger_name: row.passenger_name,
    seat_name: row.seat.seat.seat_name,
    pickup: { name: row.pickup.pickup.name, address: row.pickup.pickup.address, pickup_time: row.pickup.pickup_time.toISOString() },
    unit_price: row.unit_price.toFixed(0), responsible_name_snapshot: row.invoice.responsible_name_snapshot };
}

// Customers read their own tickets only (PRD 3.3): the actor id is the filter, never a client-supplied id.
// Admin passes requireRole like every Customer route and reads its own, normally empty, list.
export async function listOwnTickets(db: Database, identity: Actor, input: unknown = {}, now?: Date): Promise<Page<TicketDto>> {
  const parsed = ticketQuerySchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  const query = parsed.data;
  return inTransaction(db, async (tx) => {
    const actor = await requireActor(tx, identity);
    requireRole(actor, ["Customer"]);
    const at = now ?? new Date();
    const result = await tickets.findOwnTicketsPage(tx, actor.user_id, query, at);
    return { items: result.items.map(row => ticket(row, at)), pagination: { page: query.page, pageSize: query.pageSize,
      totalItems: result.totalItems, totalPages: Math.ceil(result.totalItems / query.pageSize) } };
  }, { isolationLevel: "RepeatableRead" });
}

export const ticketsService = bindDb({ listOwnTickets });
