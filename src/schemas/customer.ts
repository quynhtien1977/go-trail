import { z } from "zod";
import { pageQuerySchema, singleLine } from "./catalog";

// Customer directory and read-only booking history (PRD 3.3 "Khách hàng và lịch sử đặt vé").
// Admin reads every Customer; RouteMgr only the customers of invoices they are responsible for.
export const customerQuerySchema = pageQuerySchema.extend({
  q: singleLine(100).optional(),
  status: z.enum(["Active", "Locked"]).optional(),
});

export type CustomerSummaryDto = {
  user_id: number; full_name: string; email: string; phone: string;
  status: "Active" | "Locked"; created_at: string;
  invoice_count: number; last_booking_at: string | null;
};

// Ticket codes stay out of this contract: issuing and showing QR belongs to P04.
export type CustomerTicketDto = {
  detail_id: number; seat_name: string; passenger_name: string;
  status: "Pending" | "Valid" | "Cancelled"; check_in_status: "Pending" | "CheckedIn" | "Absent";
};

export type CustomerBookingDto = {
  invoice_id: number; departure_id: number; status: "Pending" | "Paid" | "Expired" | "Cancelled";
  total_amount: string; created_at: string; expires_at: string;
  responsible_name_snapshot: string | null; responsible_role_snapshot: string | null;
  trip_name: string; departure_date: string; tickets: CustomerTicketDto[];
};

export type CustomerDetailDto = { customer: CustomerSummaryDto; bookings: CustomerBookingDto[] };
export type CustomerBookingsDto = { customer_id: number; bookings: CustomerBookingDto[] };

export type CustomerQuery = z.infer<typeof customerQuerySchema>;
