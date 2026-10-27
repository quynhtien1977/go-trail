import "server-only";
import type { Database } from "@/server/repositories/database";
import { requireActor, requireRole, type Actor } from "@/server/auth/authorization";
import { findInvoiceSummary, findLeaderDepartures } from "@/server/repositories/account-data";
import { AppError } from "@/server/errors";
import { bindDb } from "./bind-db";

// Customer-facing DTO. Staff/financial views get separate projections in their own features.
export async function readCustomerInvoice(db: Database, identity: Actor, invoiceId: number) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["Customer"]);
  const invoice = await findInvoiceSummary(db, invoiceId, actor.role === "Admin" ? undefined : actor.user_id);
  if (!invoice) throw new AppError("NOT_FOUND", 404);
  return { ...invoice, total_amount: invoice.total_amount.toFixed(0),
    expires_at: invoice.expires_at.toISOString(), created_at: invoice.created_at.toISOString() };
}

export async function listLeaderDepartures(db: Database, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["Leader"]);
  const departures = await findLeaderDepartures(db, actor.role === "Admin" ? undefined : actor.user_id);
  return departures.map((departure) => ({ ...departure, departure_date: departure.departure_date.toISOString() }));
}

export const accountDataService = bindDb({ readCustomerInvoice, listLeaderDepartures });
