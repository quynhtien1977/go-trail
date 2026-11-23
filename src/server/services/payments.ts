import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "@/server/errors";
import { inTransaction, type Database, type Transaction } from "@/server/repositories/database";
import * as payments from "@/server/repositories/payments";
import { normalizePaymentCode, sepayWebhookSchema, type SepayWebhookAck } from "@/schemas/payment";
import { bindDb } from "./bind-db";

const ACK: SepayWebhookAck = { success: true };
// Only a departure still in its selling phase may gain a passenger. From Confirmed on, the crew was sized
// for the tickets already sold (leader ratio), so a late ticket would silently break that check.
const SELLING_DEPARTURES = ["Open", "Closed"];
const PAYABLE_INVOICES = ["Pending", "Expired"];

type PaymentBase = { amount: string; transaction_id: string; reference_code: string; raw_payload: string };

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

// 80 random bits, uppercase hex: unguessable for check-in and unambiguous to read aloud or type.
function newTicketCode(): string {
  return `TK${randomBytes(10).toString("hex").toUpperCase()}`;
}

/**
 * PRD 5.2 step 4 and 5.2.1 in one transaction. Confirms only when every condition holds, otherwise records
 * the money for review and touches nothing else. The payment row is written last, so a duplicate delivery
 * that lost the race fails on transaction_id and rolls the whole confirmation back.
 */
async function settle(tx: Transaction, paymentCode: string, received: bigint, base: PaymentBase, now?: Date) {
  const found = paymentCode ? await payments.findInvoiceByPaymentCode(tx, paymentCode) : null;
  const review = (invoice_id: number | null) => payments.insertPayment(tx, { ...base, invoice_id, status: "NeedsReview" });
  if (!found) return review(null);

  const departure = await payments.lockPaymentDeparture(tx, found.departure_id);
  const invoice = await payments.lockPaymentInvoice(tx, found.invoice_id);
  if (!departure || !invoice) return review(found.invoice_id);
  // B04: an overpayment is a valid payment; only an underpayment is held back.
  if (received < BigInt(invoice.total_amount)) return review(found.invoice_id);
  // Paid already (a second transfer), or legacy Cancelled: never re-issue or re-sell.
  if (!PAYABLE_INVOICES.includes(invoice.status)) return review(found.invoice_id);
  if (!SELLING_DEPARTURES.includes(departure.status)) return review(found.invoice_id);

  const tickets = await payments.findInvoiceTickets(tx, found.invoice_id);
  if (!tickets.length) return review(found.invoice_id);
  const seatIds = tickets.map(ticket => ticket.dep_seat_id);
  const seats = await payments.lockPaymentSeats(tx, seatIds);
  // Time is read only after every lock wait, as holdSeats does: a delivery that waited across
  // departure_date must not sell a seat on a trip that has already left.
  if (departure.departure_date <= (now ?? new Date())) return review(found.invoice_id);
  // 5.2.1: every seat still free or still held by this invoice. A seat anyone else holds or bought means
  // review, whatever was paid, and the confirmation is all-or-nothing across the invoice's seats.
  const free = seats.length === seatIds.length && seats.every(seat => seat.status === "Available"
    || (seat.status === "Locked" && seat.invoice_id === found.invoice_id));
  if (!free) return review(found.invoice_id);

  // Under the locks above these cannot fall short; if they ever do, abort rather than half-confirm.
  if (await payments.sellInvoiceSeats(tx, found.invoice_id, seatIds) !== seatIds.length) throw new Error("SEAT_SALE_SHORT");
  if (await payments.markInvoicePaid(tx, found.invoice_id) !== 1) throw new Error("INVOICE_STATE_CHANGED");
  for (const ticket of tickets) {
    if (await payments.issueTicket(tx, ticket.detail_id, newTicketCode()) !== 1) throw new Error("TICKET_STATE_CHANGED");
  }
  return payments.insertPayment(tx, { ...base, invoice_id: found.invoice_id, status: "Success" });
}

/**
 * Records one SePay incoming-transfer webhook and, when PRD 5.2.1 allows, confirms the invoice in the same
 * transaction. SePay is acknowledged only after the money is durably recorded, and money is never dropped:
 * a confirmation that a database guard refuses is still recorded as NeedsReview.
 */
export async function recordSepayPayment(db: Database, authorization: string | null, raw: string, now?: Date): Promise<SepayWebhookAck> {
  assertApiKey(authorization);
  const payload = parsePayload(raw);

  // Outgoing transfers are acknowledged and ignored: this endpoint only accounts for money received.
  if (payload.transferType !== "in") return ACK;

  const transaction_id = String(payload.id);
  // A retry or a manual replay of a recorded transfer: the first delivery's outcome stands.
  if (await payments.findPaymentByTransaction(db, transaction_id)) return ACK;

  const base: PaymentBase = { amount: String(payload.transferAmount), transaction_id,
    reference_code: payload.referenceCode?.trim() ?? "", raw_payload: raw };
  const paymentCode = normalizePaymentCode(payload.code);
  try {
    await inTransaction(db, tx => settle(tx, paymentCode, BigInt(payload.transferAmount), base, now));
  } catch (error) {
    if (!payments.isUniqueConflict(error)) throw error;
    // P2002 is either a concurrent delivery of this transfer, or a ticket/seat guard refusing the sale.
    if (await payments.findPaymentByTransaction(db, transaction_id)) return ACK;
    const invoice = paymentCode ? await payments.findInvoiceByPaymentCode(db, paymentCode) : null;
    try {
      await payments.insertPayment(db, { ...base, invoice_id: invoice?.invoice_id ?? null, status: "NeedsReview" });
    } catch (fallback) {
      if (!payments.isUniqueConflict(fallback)) throw fallback;
    }
  }
  return ACK;
}

export const paymentService = bindDb({ recordSepayPayment });
