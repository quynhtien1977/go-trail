import { z } from "zod";

const pageField = (max: number, fallback: number) =>
  z.union([
    z.number().int().min(1).max(max),
    z.string().regex(/^[1-9]\d{0,4}$/).transform(Number),
  ]).default(fallback).pipe(z.number().int().min(1).max(max));

export const adminPaymentQuerySchema = z.strictObject({
  page: pageField(10000, 1),
  pageSize: pageField(100, 20),
  status: z.enum(["NeedsReview", "Success"]).optional(),
  transaction_id: z.string().trim().max(100).optional(),
  reference_code: z.string().trim().max(100).optional(),
  payment_code: z.string().trim().max(100).optional(),
  from_date: z.string().datetime({ offset: true }).optional(),
  to_date: z.string().datetime({ offset: true }).optional(),
});

// P02 does not store why it held a transfer back. The API replays P02's checks, in P02's order, against the rows as
// they are now: a hint for the Admin, not a stored fact. A row the current state no longer explains is "unexplained".
export const reviewReasons = ["confirmed_success", "unmatched_payment_code", "underpaid", "invoice_already_paid",
  "invoice_not_payable", "departure_not_selling", "no_tickets", "departure_already_started", "seats_taken", "unexplained"] as const;
export type ReviewReason = (typeof reviewReasons)[number];

export type AdminPaymentSummaryDto = {
  payment_id: number;
  transaction_id: string;
  reference_code: string;
  payment_method: string;
  amount: string;
  status: "NeedsReview" | "Success";
  created_at: string;
  review_reason: ReviewReason;
  invoice: {
    invoice_id: number;
    payment_code: string;
    total_amount: string;
    status: string;
    created_at: string;
    expires_at: string;
    difference: string;
    // Snapshot at invoice creation, never the current staff name.
    responsible_name_snapshot: string | null;
    customer: {
      user_id: number;
      full_name: string;
      email: string;
      phone: string;
    };
    departure: {
      departure_id: number;
      trip_name: string;
      departure_date: string;
      status: string;
    };
  } | null;
};

// The raw SePay payload is detail-only: a list of up to 100 rows does not need every transfer's full body.
export type AdminPaymentDetailDto = AdminPaymentSummaryDto & {
  raw_payload: string;
  invoice: (NonNullable<AdminPaymentSummaryDto["invoice"]> & {
    ticket_count: number;
  }) | null;
};
