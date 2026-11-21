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

export type AdminPaymentSummaryDto = {
  payment_id: number;
  transaction_id: string;
  reference_code: string;
  payment_method: string;
  amount: string;
  status: "NeedsReview" | "Success";
  created_at: string;
  raw_payload: string;
  review_reason: string;
  invoice: {
    invoice_id: number;
    payment_code: string;
    total_amount: string;
    status: string;
    created_at: string;
    expires_at: string;
    difference: string;
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

export type AdminPaymentDetailDto = AdminPaymentSummaryDto & {
  invoice: (NonNullable<AdminPaymentSummaryDto["invoice"]> & {
    responsible_name_snapshot: string | null;
    ticket_count: number;
  }) | null;
};
