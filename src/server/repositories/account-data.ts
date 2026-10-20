import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";

export function findInvoiceSummary(db: PrismaClient, invoiceId: number, customerId?: number) {
  return db.invoice.findFirst({
    where: { invoice_id: invoiceId, ...(customerId === undefined ? {} : { customer_id: customerId }) },
    select: { invoice_id: true, departure_id: true, payment_code: true, status: true, total_amount: true,
      expires_at: true, created_at: true },
  });
}

export function findLeaderDepartures(db: PrismaClient, leaderId?: number) {
  return db.departure.findMany({
    where: { status: { in: ["Confirmed", "Running", "Ended"] },
      ...(leaderId === undefined ? {} : { staff: { some: { role_in_trip: "Leader",
        staff: { user_id: leaderId, staff_type: "Leader", status: "Active" } } } }) },
    select: { departure_id: true, departure_date: true, status: true, is_demo: true,
      trip: { select: { trip_id: true, name: true, city: true, location_name: true } } },
    orderBy: [{ departure_date: "asc" }, { departure_id: "asc" }], take: 100,
  });
}
