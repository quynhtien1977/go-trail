import { z } from "zod";

const singleLine = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\u0000-\u001f\u007f<>]+$/u);
const content = z.string().trim().min(1).max(10000).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]+$/u);
const fields = {
  name: singleLine(200), city: singleLine(100), district: singleLine(100).nullish(),
  location_name: singleLine(200), difficulty_level: singleLine(100).nullish(),
  length_km: z.string().regex(/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/),
  peak_height_m: z.number().int().min(0).max(2147483647).nullish(),
  base_price: z.string().regex(/^(0|[1-9]\d{0,13})$/), description: content, schedule_content: content,
};

export const createTripSchema = z.strictObject(fields);
export const updateTripSchema = createTripSchema.extend({ is_active: z.boolean() }).partial()
  .refine((value) => Object.values(value).some((item) => item !== undefined));
export const createPickupSchema = z.strictObject({ name: singleLine(200), address: singleLine(500) });
export const updatePickupSchema = createPickupSchema.extend({ is_active: z.boolean() }).partial()
  .refine((value) => Object.values(value).some((item) => item !== undefined));

const pageNumber = (max: number, fallback: string) => z.string().regex(/^[1-9]\d{0,4}$/)
  .default(fallback).transform(Number).pipe(z.number().int().max(max));
export const pageQuerySchema = z.strictObject({ page: pageNumber(10000, "1"), pageSize: pageNumber(50, "20") });
export const catalogQuerySchema = pageQuerySchema.extend({ q: singleLine(100).optional(), city: singleLine(100).optional() });

export type TripInput = z.infer<typeof createTripSchema>;
export type TripPatch = z.infer<typeof updateTripSchema>;
export type TripDto = {
  trip_id: number; name: string; city: string; district: string | null; location_name: string;
  difficulty_level: string | null; length_km: string; peak_height_m: number | null; base_price: string;
  description: string; schedule_content: string; source_url: string | null; is_active: boolean;
};
export type PickupDto = { pickup_id: number; trip_id: number; name: string; address: string; is_active: boolean };
export type TripSummaryDto = Omit<TripDto, "description" | "schedule_content">;
export type DepartureDto = { departure_id: number; trip_id: number; departure_date: string; booking_deadline: string;
  min_passengers: number; status: "Open"; price: string };
export type Page<T> = { items: T[]; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } };
