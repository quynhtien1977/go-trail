import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { DataClient } from "./database";

export type PaymentRow = { payment_id: number; invoice_id: number | null; status: "Success" | "NeedsReview" };

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
