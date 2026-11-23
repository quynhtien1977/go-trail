import "server-only";
import type { z } from "zod";
import { inTransaction, type Database } from "@/server/repositories/database";
import * as adminPayments from "@/server/repositories/admin-payments";
import {
  adminPaymentQuerySchema,
  type AdminPaymentSummaryDto,
  type AdminPaymentDetailDto,
  type ReviewReason,
} from "@/schemas/admin-payment";
import type { Page } from "@/schemas/catalog";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { AppError } from "@/server/errors";
import { bindDb } from "./bind-db";

// P03 (SCRUM-33): read-only reconciliation for Admin. Nothing here sells a seat, changes an invoice or marks a
// payment Success; NeedsReview stays NeedsReview (PRD 5.2, B04). Money is compared as BigInt from Decimal strings.
type PaymentRow = NonNullable<Awaited<ReturnType<typeof adminPayments.findAdminPayment>>>;
const PAYABLE_INVOICES = ["Pending", "Expired"];
const SELLING_DEPARTURES = ["Open", "Closed"];

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

// Replays settle() in payments.ts, check by check and in the same order, against the current rows. The payment's
// created_at stands in for the moment P02 decided. Keep this list in step with settle() when P02 changes.
function reviewReason(row: PaymentRow): ReviewReason {
  if (row.status === "Success") return "confirmed_success";
  const invoice = row.invoice;
  if (!invoice) return "unmatched_payment_code";
  if (BigInt(row.amount.toFixed(0)) < BigInt(invoice.total_amount.toFixed(0))) return "underpaid";
  if (invoice.status === "Paid") return "invoice_already_paid";
  if (!PAYABLE_INVOICES.includes(invoice.status)) return "invoice_not_payable";
  if (!SELLING_DEPARTURES.includes(invoice.departure.status)) return "departure_not_selling";
  if (!invoice.details.length) return "no_tickets";
  if (invoice.departure.departure_date <= row.created_at) return "departure_already_started";
  const taken = invoice.details.some(({ seat }) => !(seat.status === "Available"
    || (seat.status === "Locked" && seat.invoice_id === invoice.invoice_id)));
  return taken ? "seats_taken" : "unexplained";
}

function summary(row: PaymentRow): AdminPaymentSummaryDto {
  const amount = row.amount.toFixed(0);
  const inv = row.invoice;
  return {
    payment_id: row.payment_id,
    transaction_id: row.transaction_id,
    reference_code: row.reference_code,
    payment_method: row.payment_method,
    amount,
    status: row.status,
    created_at: row.created_at.toISOString(),
    review_reason: reviewReason(row),
    invoice: inv && {
      invoice_id: inv.invoice_id,
      payment_code: inv.payment_code,
      total_amount: inv.total_amount.toFixed(0),
      status: inv.status,
      created_at: inv.created_at.toISOString(),
      expires_at: inv.expires_at.toISOString(),
      // Received minus due: negative is a shortfall, positive a B04 surplus that is kept and never refunded.
      difference: (BigInt(amount) - BigInt(inv.total_amount.toFixed(0))).toString(),
      customer: { user_id: inv.customer.user_id, full_name: inv.customer.full_name, email: inv.customer.email,
        phone: inv.customer.phone },
      departure: { departure_id: inv.departure.departure_id, trip_name: inv.departure.trip.name,
        departure_date: inv.departure.departure_date.toISOString(), status: inv.departure.status },
    },
  };
}

export async function listAdminPayments(db: Database, identity: Actor, input: unknown = {}): Promise<Page<AdminPaymentSummaryDto>> {
  const query = parse(adminPaymentQuerySchema, input);
  // One snapshot, so the page and its total agree even while webhooks keep arriving.
  return inTransaction(db, async (tx) => {
    await adminOnly(tx, identity);
    const { rows, totalItems } = await adminPayments.pageAdminPayments(tx, {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      transactionId: query.transaction_id,
      referenceCode: query.reference_code,
      paymentCode: query.payment_code,
      fromDate: query.from_date ? new Date(query.from_date) : undefined,
      toDate: query.to_date ? new Date(query.to_date) : undefined,
    });
    return { items: rows.map(summary), pagination: { page: query.page, pageSize: query.pageSize, totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize) } };
  }, { isolationLevel: "RepeatableRead" });
}

export async function readAdminPayment(db: Database, identity: Actor, paymentId: number): Promise<AdminPaymentDetailDto> {
  assertId(paymentId);
  return inTransaction(db, async (tx) => {
    await adminOnly(tx, identity);
    const row = await adminPayments.findAdminPayment(tx, paymentId);
    if (!row) throw new AppError("NOT_FOUND", 404);
    const base = summary(row);
    return { ...base, raw_payload: row.raw_payload,
      invoice: base.invoice && row.invoice && { ...base.invoice,
        responsible_name_snapshot: row.invoice.responsible_name_snapshot, ticket_count: row.invoice.details.length } };
  }, { isolationLevel: "RepeatableRead" });
}

export const adminPaymentService = bindDb({ listAdminPayments, readAdminPayment });
