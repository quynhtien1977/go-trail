import type { InvoiceDto } from "@/schemas/invoice";

// Presentation inputs only; map from future authorized P03/P04 contracts, not HTTP DTOs.
export type TicketView = {
  id: number; invoiceId: number; invoiceStatus: InvoiceDto["status"]; status: InvoiceDto["tickets"][number]["status"];
  issuedCode: string | null; tripName: string; departureAt: string; passengerName: string; seatLabel: string;
  pickupName: string; pickupAddress: string; pickupAt: string; unitPrice: string; responsibleName: string | null;
};
export type PaymentReviewView = {
  id: number; transactionReference: string; receivedAt: string; receivedAmount: string;
  status: "NeedsReview" | "Success"; reason: string | null;
  invoice: { id: number; paymentCode: string; totalAmount: string; status: InvoiceDto["status"]; tripName: string; responsibleName: string | null } | null;
};
export type PrivatePage<T> = { items: T[]; page: number; totalPages: number; totalItems: number };
export type PrivateQuery = { page: number; filter: string; query: string };
export type PrivatePageSource<T> = (query: PrivateQuery, signal: AbortSignal) => Promise<PrivatePage<T>>;
export type PrivateKind = "tickets" | "payments";

export function issuedTicketCode(ticket: Pick<TicketView, "invoiceStatus" | "status" | "issuedCode">): string | null {
  return ticket.invoiceStatus === "Paid" && ticket.status === "Valid" && ticket.issuedCode?.trim() ? ticket.issuedCode : null;
}

// Presentation guard only. Future endpoints remain responsible for actual authorization.
export function privateReadScope(kind: PrivateKind, status: string, user?: { user_id: number; role: string }): string | null {
  if (status !== "authenticated" || !user || !Number.isSafeInteger(user.user_id) || user.user_id < 1) return null;
  if (user.role !== "Admin" && (kind === "payments" || user.role !== "Customer")) return null;
  return `${kind}:${user.role}:${user.user_id}`;
}

export function invoiceLookupPath(value: string): string | null {
  return /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647 ? `/checkout/invoices/${value}` : null;
}

export function ticketStatusLabel(ticket: Pick<TicketView, "invoiceStatus" | "status" | "issuedCode">) {
  if (ticket.invoiceStatus === "Expired") return "Hết hạn thanh toán";
  if (ticket.invoiceStatus === "Cancelled" || ticket.status === "Cancelled") return "Vé không còn hiệu lực";
  if (ticket.invoiceStatus === "Paid" && ticket.status === "Valid") return "Vé hợp lệ";
  return ticket.invoiceStatus === "Paid" ? "Chờ phát hành vé" : "Chờ thanh toán";
}
