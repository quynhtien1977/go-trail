import "server-only";
import type { z } from "zod";
import type { Database } from "@/server/repositories/database";
import * as adminPayments from "@/server/repositories/admin-payments";
import {
  adminPaymentQuerySchema,
  type AdminPaymentSummaryDto,
  type AdminPaymentDetailDto,
} from "@/schemas/admin-payment";
import type { Page } from "@/schemas/catalog";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { AppError } from "@/server/errors";
import { bindDb } from "./bind-db";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}

function assertId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new AppError("INVALID_INPUT", 422);
}

async function adminOnly(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["Admin"]);
  return actor;
}

function determineReviewReason(
  status: "Success" | "NeedsReview",
  amountStr: string,
  invoice: {
    invoice_id: number;
    status: string;
    total_amount: { toFixed: (digits: number) => string };
    details: { seat: { status: string; invoice_id: number | null } }[];
  } | null
): string {
  if (status === "Success") return "confirmed_success";
  if (!invoice) return "unmatched_payment_code";

  const amountBig = BigInt(amountStr);
  const totalBig = BigInt(invoice.total_amount.toFixed(0));

  if (amountBig < totalBig) return "underpaid";
  if (invoice.status === "Cancelled") return "invoice_cancelled";

  const seatLost = invoice.details.some(
    (d) => d.seat.status === "Sold" || (d.seat.invoice_id !== null && d.seat.invoice_id !== invoice.invoice_id)
  );
  // If the invoice is Expired, payment arrived late
  if (invoice.status === "Expired") {
    return seatLost ? "seats_taken_after_expiry" : "late_payment_retained";
  }
  return "pending_reconciliation";
}

export async function listAdminPayments(
  db: Database,
  identity: Actor,
  input: unknown = {}
): Promise<Page<AdminPaymentSummaryDto>> {
  const query = parse(adminPaymentQuerySchema, input);
  await adminOnly(db, identity);

  const { rows, totalItems } = await adminPayments.pageAdminPayments(db, {
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    transactionId: query.transaction_id,
    referenceCode: query.reference_code,
    paymentCode: query.payment_code,
    fromDate: query.from_date ? new Date(query.from_date) : undefined,
    toDate: query.to_date ? new Date(query.to_date) : undefined,
  });

  const items: AdminPaymentSummaryDto[] = rows.map((row) => {
    const amountStr = row.amount.toFixed(0);
    const inv = row.invoice;
    let invoiceDto: AdminPaymentSummaryDto["invoice"] = null;
    if (inv) {
      const totalAmountStr = inv.total_amount.toFixed(0);
      const diff = (BigInt(amountStr) - BigInt(totalAmountStr)).toString();
      invoiceDto = {
        invoice_id: inv.invoice_id,
        payment_code: inv.payment_code,
        total_amount: totalAmountStr,
        status: inv.status,
        created_at: inv.created_at.toISOString(),
        expires_at: inv.expires_at.toISOString(),
        difference: diff,
        customer: {
          user_id: inv.customer.user_id,
          full_name: inv.customer.full_name,
          email: inv.customer.email,
          phone: inv.customer.phone,
        },
        departure: {
          departure_id: inv.departure.departure_id,
          trip_name: inv.departure.trip.name,
          departure_date: inv.departure.departure_date.toISOString(),
          status: inv.departure.status,
        },
      };
    }

    return {
      payment_id: row.payment_id,
      transaction_id: row.transaction_id,
      reference_code: row.reference_code,
      payment_method: row.payment_method,
      amount: amountStr,
      status: row.status,
      created_at: row.created_at.toISOString(),
      raw_payload: row.raw_payload,
      review_reason: determineReviewReason(row.status, amountStr, inv),
      invoice: invoiceDto,
    };
  });

  return {
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

export async function readAdminPayment(
  db: Database,
  identity: Actor,
  paymentId: number
): Promise<AdminPaymentDetailDto> {
  assertId(paymentId);
  await adminOnly(db, identity);

  const row = await adminPayments.findAdminPayment(db, paymentId);
  if (!row) throw new AppError("NOT_FOUND", 404);

  const amountStr = row.amount.toFixed(0);
  const inv = row.invoice;
  let invoiceDto: AdminPaymentDetailDto["invoice"] = null;
  if (inv) {
    const totalAmountStr = inv.total_amount.toFixed(0);
    const diff = (BigInt(amountStr) - BigInt(totalAmountStr)).toString();
    invoiceDto = {
      invoice_id: inv.invoice_id,
      payment_code: inv.payment_code,
      total_amount: totalAmountStr,
      status: inv.status,
      created_at: inv.created_at.toISOString(),
      expires_at: inv.expires_at.toISOString(),
      difference: diff,
      responsible_name_snapshot: inv.responsible_name_snapshot,
      ticket_count: inv.details.length,
      customer: {
        user_id: inv.customer.user_id,
        full_name: inv.customer.full_name,
        email: inv.customer.email,
        phone: inv.customer.phone,
      },
      departure: {
        departure_id: inv.departure.departure_id,
        trip_name: inv.departure.trip.name,
        departure_date: inv.departure.departure_date.toISOString(),
        status: inv.departure.status,
      },
    };
  }

  return {
    payment_id: row.payment_id,
    transaction_id: row.transaction_id,
    reference_code: row.reference_code,
    payment_method: row.payment_method,
    amount: amountStr,
    status: row.status,
    created_at: row.created_at.toISOString(),
    raw_payload: row.raw_payload,
    review_reason: determineReviewReason(row.status, amountStr, inv),
    invoice: invoiceDto,
  };
}

export const adminPaymentService = bindDb({
  listAdminPayments,
  readAdminPayment,
});
