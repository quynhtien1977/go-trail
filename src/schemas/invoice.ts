// Customer own/Admin read contract. Money is an integer VND string; dates are UTC ISO.
export type InvoicePayment = {
  status: "Ready"; bank_id: string; account_number: string; account_name: string;
  amount: string; transfer_content: string; qr_url: string;
} | { status: "Expired" | "NotPayable" | "Unavailable" };

export type InvoiceDto = {
  invoice_id: number; departure_id: number; payment_code: string;
  status: "Pending" | "Paid" | "Expired" | "Cancelled"; total_amount: string;
  expires_at: string; created_at: string; server_time: string;
  responsible_name_snapshot: string | null; responsible_role_snapshot: string | null;
  customer_name: string;
  departure: { trip_name: string; departure_date: string };
  tickets: { detail_id: number; dep_seat_id: number; dep_pickup_id: number; seat_name: string; passenger_name: string;
    unit_price: string; status: "Pending" | "Valid" | "Cancelled";
    pickup_name: string; pickup_address: string; pickup_time: string }[];
  payment: InvoicePayment;
};
