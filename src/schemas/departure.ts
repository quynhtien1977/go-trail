import { z } from "zod";
import { pageQuerySchema } from "./catalog";

export const departureStatuses = ["Draft", "Open", "Closed", "Confirmed", "Running", "Ended", "Cancelled", "Rescheduled"] as const;
const id = z.number().int().positive().max(2147483647);
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const pickups = z.array(z.strictObject({ pickup_id: id, pickup_time: instant })).max(20)
  .refine((items) => new Set(items.map((item) => item.pickup_id)).size === items.length);
const fields = {
  departure_date: instant, booking_deadline: instant, min_passengers: z.number().int().min(1).max(200),
  price_override: z.string().regex(/^(0|[1-9]\d{0,13})$/).nullish(), pickups, invoice_owner_user_id: id,
};

export const createDepartureSchema = z.strictObject({ ...fields, pickups: pickups.default([]),
  invoice_owner_user_id: id.optional(), is_demo: z.boolean().default(false) });
// Every status parses so unsupported edges (Cancelled/Rescheduled, skips, Ended before L02) get a stable 409, not a 422.
export const updateDepartureSchema = z.strictObject({ ...fields, status: z.enum(departureStatuses) }).partial()
  .refine((value) => Object.values(value).some((item) => item !== undefined));
export const departureQuerySchema = pageQuerySchema.extend({ status: z.enum(departureStatuses).optional() });

export type ManagedDepartureDto = {
  departure_id: number; trip_id: number; departure_date: string; booking_deadline: string; min_passengers: number;
  price_override: string | null; price: string; status: (typeof departureStatuses)[number]; is_demo: boolean;
  invoice_owner: { user_id: number; full_name: string } | null;
  pickups: { dep_pickup_id: number; pickup_id: number; name: string; address: string; pickup_time: string }[];
};
