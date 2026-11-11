import "server-only";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "@/server/errors";
import type { Database } from "@/server/repositories/database";
import * as payments from "@/server/repositories/payments";
import { sepayWebhookSchema, type SepayWebhookAck } from "@/schemas/payment";
import { bindDb } from "./bind-db";

// P01 scope (SCRUM-31): authenticate, record durably, deduplicate. Confirming Paid/Sold/Valid is P02
// (SCRUM-32), so every payment recorded here is NeedsReview and no invoice, seat or ticket is touched.
const RECORDED_STATUS = "NeedsReview" as const;

function assertApiKey(header: string | null): void {
  const configured = process.env.SEPAY_API_KEY ?? "";
  const presented = header?.startsWith("Apikey ") ? header.slice("Apikey ".length).trim() : "";
  // Fail closed when the key is unset: no request can be authentic without one.
  if (!configured || !presented) throw new AppError("UNAUTHENTICATED", 401);
  const expected = Buffer.from(configured, "utf8");
  const actual = Buffer.from(presented, "utf8");
  // timingSafeEqual throws on a length mismatch, so compare lengths without leaking position.
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new AppError("UNAUTHENTICATED", 401);
  }
}

function parsePayload(raw: string) {
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new AppError("INVALID_INPUT", 422); }
  const parsed = sepayWebhookSchema.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}

/**
 * Records one SePay incoming-transfer webhook. Returns only after the row is durably written,
 * so an acknowledgement never outruns the record. Retries of the same transaction_id are
 * absorbed by the UNIQUE index rather than by a prior read, which a concurrent retry could race.
 */
export async function recordSepayPayment(db: Database, authorization: string | null, raw: string): Promise<SepayWebhookAck> {
  assertApiKey(authorization);
  const payload = parsePayload(raw);

  // Outgoing transfers are acknowledged and ignored: this endpoint only accounts for money received.
  if (payload.transferType !== "in") return { success: true };

  const transaction_id = String(payload.id);
  const paymentCode = payload.code?.trim() ?? "";
  const invoice = paymentCode ? await payments.findInvoiceByPaymentCode(db, paymentCode) : null;

  try {
    await payments.insertPayment(db, {
      invoice_id: invoice?.invoice_id ?? null,
      amount: String(payload.transferAmount),
      transaction_id,
      reference_code: payload.referenceCode?.trim() ?? "",
      status: RECORDED_STATUS,
      raw_payload: raw,
    });
  } catch (error) {
    // A duplicate delivery is a success for SePay; the first record already stands.
    if (!payments.isUniqueConflict(error)) throw error;
  }
  return { success: true };
}

export const paymentService = bindDb({ recordSepayPayment });
