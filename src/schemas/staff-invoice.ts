import { z } from "zod";

const id = z.number().int().positive().max(2147483647);
const pageField = (max: number, fallback: number) =>
  z.union([
    z.number().int().min(1).max(max),
    z.string().regex(/^[1-9]\d{0,4}$/).transform(Number),
  ]).default(fallback).pipe(z.number().int().min(1).max(max));

export const invoiceStatuses = ["Pending", "Paid", "Expired", "Cancelled"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const ticketStatuses = ["Pending", "Valid", "Cancelled"] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

export const checkInStatuses = ["Pending", "CheckedIn", "Absent"] as const;
export type CheckInStatus = (typeof checkInStatuses)[number];

export const staffInvoiceQuerySchema = z.strictObject({
  page: pageField(10000, 1),
  pageSize: pageField(100, 20),
  status: z.enum(invoiceStatuses).optional(),
  departure_id: z.union([id, z.string().regex(/^\d+$/).transform(Number)]).optional(),
  responsible_user_id: z.union([id, z.string().regex(/^\d+$/).transform(Number)]).optional(),
  search: z.string().trim().max(100).optional(),
  from_date: z.string().datetime({ offset: true }).optional(),
  to_date: z.string().datetime({ offset: true }).optional(),
});

export const staffTicketQuerySchema = z.strictObject({
  page: pageField(10000, 1),
  pageSize: pageField(100, 20),
  ticket_code: z.string().trim().max(100).optional(),
  departure_id: z.union([id, z.string().regex(/^\d+$/).transform(Number)]).optional(),
  passenger_phone: z.string().trim().max(20).optional(),
  passenger_name: z.string().trim().max(100).optional(),
  check_in_status: z.enum(checkInStatuses).optional(),
  status: z.enum(ticketStatuses).optional(),
});

export type StaffInvoiceSummaryDto = {
  invoice_id: number;
  payment_code: string;
  total_amount: string;
  status: InvoiceStatus;
  expires_at: string;
  created_at: string;
  responsible_user_id: number | null;
  responsible_name_snapshot: string | null;
  responsible_role_snapshot: string | null;
  customer: {
    user_id: number;
    full_name: string;
    phone: string;
  };
  departure: {
    departure_id: number;
    trip_name: string;
    departure_date: string;
  };
  ticket_count: number;
};

export type StaffInvoiceTicketDto = {
  detail_id: number;
  dep_seat_id: number;
  seat_name: string;
  passenger_name: string;
  passenger_phone: string;
  emergency_contact: string;
  health_declaration: boolean;
  unit_price: string;
  ticket_code: string | null;
  status: TicketStatus;
  check_in_status: CheckInStatus;
  check_in_time: string | null;
  pickup: {
    dep_pickup_id: number;
    name: string;
    address: string;
    pickup_time: string;
  };
};

export type StaffInvoicePaymentDto = {
  payment_id: number;
  transaction_id: string;
  reference_code: string;
  amount: string;
  status: "Success" | "NeedsReview";
  created_at: string;
};

export type StaffInvoiceDetailDto = StaffInvoiceSummaryDto & {
  tickets: StaffInvoiceTicketDto[];
  payments: StaffInvoicePaymentDto[];
};

export type StaffTicketSearchResultDto = {
  detail_id: number;
  invoice_id: number;
  ticket_code: string | null;
  passenger_name: string;
  passenger_phone: string;
  unit_price: string;
  status: TicketStatus;
  check_in_status: CheckInStatus;
  check_in_time: string | null;
  seat_name: string;
  departure: {
    departure_id: number;
    trip_name: string;
    departure_date: string;
  };
  invoice: {
    payment_code: string;
    status: InvoiceStatus;
    responsible_name_snapshot: string | null;
  };
};
