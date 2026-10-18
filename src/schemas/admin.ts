import { z } from "zod";
import { userRoles } from "./auth";
import { pageQuerySchema, singleLine } from "./catalog";

// Editable settings and their allowed ranges; other rows stay read-only.
export const settingRanges = {
  SEAT_TTL_MINUTES: [1, 120], MAX_SEATS_PER_INVOICE: [1, 50], LEADER_RATIO: [1, 100],
} as const satisfies Record<string, readonly [number, number]>;
export const settingKeys = Object.keys(settingRanges) as [keyof typeof settingRanges, ...(keyof typeof settingRanges)[]];
export const updateSettingSchema = z.strictObject({ setting_value: z.string().regex(/^[1-9]\d{0,4}$/) });

export const userQuerySchema = pageQuerySchema.extend({ q: singleLine(100).optional(),
  role: z.enum(userRoles).optional(), status: z.enum(["Active", "Locked"]).optional() });
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
export const auditQuerySchema = pageQuerySchema.extend({
  table_name: z.string().regex(/^[a-z_]{1,40}$/).optional(), record_id: z.string().regex(/^[A-Za-z0-9_]{1,40}$/).optional(),
  action: z.string().regex(/^[A-Za-z]{1,40}$/).optional(), user_id: z.string().regex(/^[1-9]\d{0,9}$/).transform(Number).optional(),
  from: instant.optional(), to: instant.optional(),
});
