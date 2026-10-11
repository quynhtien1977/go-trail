import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { requireActor, requireRole, type Actor } from "@/server/auth/authorization";
import { AppError } from "@/server/errors";

// Customer-facing DTO. Staff/financial views get separate projections in their own features.
export async function readCustomerInvoice(db: PrismaClient, identity: Actor, invoiceId: number) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["Customer"]);
  const invoice = await db.invoice.findFirst({
    where: { invoice_id: invoiceId, ...(actor.role === "Admin" ? {} : { customer_id: actor.user_id }) },
    select: { invoice_id: true, departure_id: true, payment_code: true, status: true, total_amount: true,
      expires_at: true, created_at: true },
  });
  if (!invoice) throw new AppError("NOT_FOUND", 404);
  return { ...invoice, total_amount: invoice.total_amount.toFixed(0),
    expires_at: invoice.expires_at.toISOString(), created_at: invoice.created_at.toISOString() };
}

export async function listLeaderDepartures(db: PrismaClient, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["Leader"]);
  const departures = await db.departure.findMany({
    where: { status: { in: ["Confirmed", "Running", "Ended"] },
      ...(actor.role === "Admin" ? {} : { staff: { some: { role_in_trip: "Leader",
        staff: { user_id: actor.user_id, staff_type: "Leader", status: "Active" } } } }) },
    select: { departure_id: true, departure_date: true, status: true, is_demo: true,
      trip: { select: { trip_id: true, name: true, city: true, location_name: true } } },
    orderBy: [{ departure_date: "asc" }, { departure_id: "asc" }], take: 100,
  });
  return departures.map((departure) => ({ ...departure, departure_date: departure.departure_date.toISOString() }));
}
