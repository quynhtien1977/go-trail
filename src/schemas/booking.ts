import { z } from "zod";
import { singleLine } from "./catalog";

const id = z.number().int().positive().max(2147483647);
// Hard ceiling on request size; the business limit comes from MAX_SEATS_PER_INVOICE.
export const holdSeatsSchema = z.strictObject({
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  seats: z.array(z.strictObject({
    dep_seat_id: id, dep_pickup_id: id, passenger_name: singleLine(100),
    passenger_phone: z.string().trim().regex(/^\+?[0-9]{9,15}$/), emergency_contact: singleLine(150),
    health_declaration: z.literal(true),
  })).min(1).max(50).refine((seats) => new Set(seats.map((seat) => seat.dep_seat_id)).size === seats.length),
});

export type HoldSeatsInput = z.infer<typeof holdSeatsSchema>;

export type HoldDto = {
  invoice_id: number; departure_id: number; payment_code: string; status: "Pending" | "Paid" | "Expired" | "Cancelled";
  total_amount: string; expires_at: string;
  responsible_name_snapshot: string | null; responsible_role_snapshot: string | null;
  tickets: { detail_id: number; dep_seat_id: number; seat_name: string; dep_pickup_id: number; passenger_name: string; unit_price: string }[];
};
