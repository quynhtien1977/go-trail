import { z } from "zod";
import { pageQuerySchema } from "./catalog";

// "My tickets" (P04, SCRUM-34). The filter values are the ones the existing ticket UI already offers,
// so the UI can pass its selection through unchanged. Omitting `status` returns every ticket.
export const ticketFilters = ["valid", "pending", "expired"] as const;
export const ticketQuerySchema = pageQuerySchema.extend({ status: z.enum(ticketFilters).optional() });
export type TicketQuery = z.infer<typeof ticketQuerySchema>;

export type TicketDto = {
  detail_id: number;
  invoice_id: number;
  invoice_status: "Pending" | "Paid" | "Expired" | "Cancelled";
  invoice_expires_at: string;
  status: "Pending" | "Valid" | "Cancelled";
  check_in_status: "Pending" | "CheckedIn" | "Absent";
  // The QR payload. Null unless the invoice is Paid and the ticket Valid: a code is only ever shown once issued.
  ticket_code: string | null;
  trip_name: string;
  departure_id: number;
  departure_date: string;
  passenger_name: string;
  seat_name: string;
  pickup: { name: string; address: string; pickup_time: string };
  unit_price: string;
  responsible_name_snapshot: string | null;
};
