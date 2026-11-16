import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { DataClient, Transaction } from "./database";

export type PaymentRow = { payment_id: number; invoice_id: number | null; status: "Success" | "NeedsReview" };
type SeatLock = { dep_seat_id: number; status: "Available" | "Locked" | "Sold"; invoice_id: number | null };

export function isUniqueConflict(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "P2002";
}

// The payment_code is unique per invoice; a transfer that matches none is still recorded with invoice_id null.
export function findInvoiceByPaymentCode(db: DataClient, paymentCode: string) {
  return db.invoice.findUnique({
    where: { payment_code: paymentCode },
    select: { invoice_id: true, status: true, total_amount: true, expires_at: true, departure_id: true },
  });
}

export function findPaymentByTransaction(db: DataClient, transactionId: string) {
  return db.payment.findUnique({
    where: { transaction_id: transactionId },
    select: { payment_id: true, invoice_id: true, status: true },
  });
}

// transaction_id carries a UNIQUE index: the database, not a prior read, is what makes retries safe.
export function insertPayment(db: DataClient, data: Prisma.PaymentUncheckedCreateInput): Promise<PaymentRow> {
  return db.payment.create({ data, select: { payment_id: true, invoice_id: true, status: true } });
}

// Lock order matches holdSeats (departure SHARE -> invoices UPDATE -> seats UPDATE, ascending),
// so a confirmation and a competing hold can serialize but never deadlock.
export async function lockPaymentDeparture(tx: Transaction, departureId: number) {
  const rows = await tx.$queryRaw<{ status: string; departure_date: Date }[]>`
    SELECT status::text AS status, departure_date FROM departures WHERE departure_id = ${departureId} FOR SHARE`;
  return rows[0] ?? null;
}

// total_amount is read as text so the comparison with the received amount stays exact integer VND.
export async function lockPaymentInvoice(tx: Transaction, invoiceId: number) {
  const rows = await tx.$queryRaw<{ status: string; total_amount: string }[]>`
    SELECT status::text AS status, total_amount::text AS total_amount FROM invoices WHERE invoice_id = ${invoiceId} FOR UPDATE`;
  return rows[0] ?? null;
}

// Tickets, not departure_seats.invoice_id, name an invoice's seats: expiry clears the seat link but keeps the ticket.
export async function findInvoiceTickets(tx: Transaction, invoiceId: number) {
  return tx.invoiceDetail.findMany({ where: { invoice_id: invoiceId }, orderBy: { dep_seat_id: "asc" },
    select: { detail_id: true, dep_seat_id: true } });
}

export function lockPaymentSeats(tx: Transaction, seatIds: number[]) {
  return tx.$queryRaw<SeatLock[]>`
    SELECT dep_seat_id, status::text AS status, invoice_id FROM departure_seats
    WHERE dep_seat_id IN (${Prisma.join(seatIds)}) ORDER BY dep_seat_id FOR UPDATE`;
}

// The WHERE clause re-states the 5.2.1 guard, so a seat that changed hands can never be sold here.
export function sellInvoiceSeats(tx: Transaction, invoiceId: number, seatIds: number[]) {
  return tx.$executeRaw`
    UPDATE departure_seats SET status = 'Sold', invoice_id = ${invoiceId}, locked_until = NULL
    WHERE dep_seat_id IN (${Prisma.join(seatIds)})
      AND (status = 'Available' OR (status = 'Locked' AND invoice_id = ${invoiceId}))`;
}

// Each returns the number of rows changed, so the service can refuse a partial confirmation.
export async function markInvoicePaid(tx: Transaction, invoiceId: number): Promise<number> {
  const result = await tx.invoice.updateMany({ where: { invoice_id: invoiceId, status: { in: ["Pending", "Expired"] } },
    data: { status: "Paid" } });
  return result.count;
}

// Cancelled is accepted only because expiry cancels a hold's tickets as technical cleanup; PRD 5.2.1 lets that
// Expired invoice be confirmed later, and its tickets must come back with it.
export async function issueTicket(tx: Transaction, detailId: number, ticketCode: string): Promise<number> {
  const result = await tx.invoiceDetail.updateMany({ where: { detail_id: detailId, status: { in: ["Pending", "Cancelled"] } },
    data: { status: "Valid", ticket_code: ticketCode } });
  return result.count;
}
