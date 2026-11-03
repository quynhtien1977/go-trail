import "server-only";
import type { Database } from "@/server/repositories/database";
import { requireActor, requireRole, type Actor } from "@/server/auth/authorization";
import { findInvoiceSummary, findLeaderDepartures } from "@/server/repositories/account-data";
import { AppError } from "@/server/errors";
import { bindDb } from "./bind-db";
import type { InvoiceDto } from "@/schemas/invoice";
import { invoicePayment } from "./invoice-payment";

// Customer-facing DTO. Staff/financial views get separate projections in their own features.
export async function readCustomerInvoice(db: Database, identity: Actor, invoiceId: number, now?: Date): Promise<InvoiceDto> {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["Customer"]);
  if (!Number.isSafeInteger(invoiceId) || invoiceId < 1 || invoiceId > 2147483647) throw new AppError("INVALID_INPUT", 422);
  const invoice = await findInvoiceSummary(db, invoiceId, actor.role === "Admin" ? undefined : actor.user_id);
  if (!invoice) throw new AppError("NOT_FOUND", 404);
  const readAt = now ?? new Date();
  const total_amount = invoice.total_amount.toFixed(0);
  return { invoice_id: invoice.invoice_id, departure_id: invoice.departure_id, payment_code: invoice.payment_code,
    status: invoice.status, total_amount, expires_at: invoice.expires_at.toISOString(), created_at: invoice.created_at.toISOString(),
    server_time: readAt.toISOString(), responsible_name_snapshot: invoice.responsible_name_snapshot,
    responsible_role_snapshot: invoice.responsible_role_snapshot, customer_name: invoice.customer.full_name,
    departure: { trip_name: invoice.departure.trip.name, departure_date: invoice.departure.departure_date.toISOString() },
    tickets: invoice.details.map(ticket => ({ detail_id: ticket.detail_id, dep_seat_id: ticket.dep_seat_id,
      dep_pickup_id: ticket.dep_pickup_id, seat_name: ticket.seat.seat.seat_name, passenger_name: ticket.passenger_name,
      unit_price: ticket.unit_price.toFixed(0), status: ticket.status, pickup_name: ticket.pickup.pickup.name,
      pickup_address: ticket.pickup.pickup.address, pickup_time: ticket.pickup.pickup_time.toISOString() })),
    payment: invoicePayment({ status: invoice.status, expires_at: invoice.expires_at, total_amount, payment_code: invoice.payment_code }, readAt) };
}

export async function listLeaderDepartures(db: Database, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["Leader"]);
  const departures = await findLeaderDepartures(db, actor.role === "Admin" ? undefined : actor.user_id);
  return departures.map((departure) => ({ ...departure, departure_date: departure.departure_date.toISOString() }));
}

export const accountDataService = bindDb({ readCustomerInvoice, listLeaderDepartures });
