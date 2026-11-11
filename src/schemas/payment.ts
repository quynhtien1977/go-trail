import { z } from "zod";

// SePay incoming-transfer webhook payload: https://docs.sepay.vn/tich-hop-webhooks.html
// Unknown keys are ignored here on purpose; PAYMENTS.raw_payload keeps the body verbatim.
// VND is numeric(14,0), so the amount must be a non-negative integer within 14 digits.
const MAX_VND = 99_999_999_999_999;

export const sepayWebhookSchema = z.object({
  id: z.union([
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    z.string().trim().regex(/^[1-9]\d{0,38}$/),
  ]),
  transferType: z.enum(["in", "out"]),
  transferAmount: z.number().int().nonnegative().max(MAX_VND),
  code: z.string().trim().max(100).nullish(),
  referenceCode: z.string().trim().max(100).nullish(),
  content: z.string().max(1000).nullish(),
  gateway: z.string().max(100).nullish(),
  transactionDate: z.string().max(100).nullish(),
  accountNumber: z.string().max(100).nullish(),
  subAccount: z.string().max(100).nullish(),
  description: z.string().max(1000).nullish(),
  accumulated: z.number().nullish(),
});

export type SepayWebhookInput = z.infer<typeof sepayWebhookSchema>;

// SePay only reads this acknowledgement; it is not the project's { data } envelope.
export type SepayWebhookAck = { success: true };
