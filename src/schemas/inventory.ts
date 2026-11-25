import { z } from "zod";

export const supplyCategories = ["Food", "Drink", "Gear", "Medical"] as const;
export type SupplyCategory = (typeof supplyCategories)[number];

const id = z.number().int().positive().max(2147483647);
const idempotencyKey = z.string().trim().regex(/^[A-Za-z0-9_-]{16,64}$/);

export const createSupplyItemSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  category: z.enum(supplyCategories),
  unit: z.string().trim().min(1).max(50),
});

export const updateSupplyItemSchema = z.strictObject({
  name: z.string().trim().min(1).max(100).optional(),
  category: z.enum(supplyCategories).optional(),
  unit: z.string().trim().min(1).max(50).optional(),
  is_active: z.boolean().optional(),
}).refine((value) => Object.values(value).some((v) => v !== undefined));

export const receiveSupplySchema = z.strictObject({
  item_id: id,
  quantity: z.number().int().positive().max(1_000_000),
  idempotency_key: idempotencyKey,
  note: z.string().trim().max(500).nullish(),
});

const pageField = (max: number, fallback: number) =>
  z.union([
    z.number().int().min(1).max(max),
    z.string().regex(/^[1-9]\d{0,4}$/).transform(Number),
  ]).default(fallback).pipe(z.number().int().min(1).max(max));

export const supplyItemQuerySchema = z.strictObject({
  page: pageField(10000, 1),
  pageSize: pageField(50, 20),
  category: z.enum(supplyCategories).optional(),
  is_active: z.union([
    z.boolean(),
    z.enum(["true", "false"]).transform((v) => v === "true"),
  ]).optional(),
});

export type CreateSupplyItemInput = z.infer<typeof createSupplyItemSchema>;
export type UpdateSupplyItemInput = z.infer<typeof updateSupplyItemSchema>;
export type ReceiveSupplyInput = z.infer<typeof receiveSupplySchema>;

export type SupplyItemDto = {
  item_id: number;
  name: string;
  category: SupplyCategory;
  unit: string;
  is_active: boolean;
  on_hand: number;
  created_at: string;
};

export type SupplyTransactionDto = {
  txn_id: number;
  item_id: number;
  txn_type: "Receive" | "Issue" | "Return" | "Dispose";
  quantity: number;
  departure_id: number | null;
  created_by_user_id: number;
  idempotency_key: string;
  note: string | null;
  created_at: string;
};
