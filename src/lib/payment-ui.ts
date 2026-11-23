import type { InvoiceDto } from "@/schemas/invoice";
import type { TicketDto } from "@/schemas/ticket";
import type { AdminPaymentSummaryDto, ReviewReason } from "@/schemas/admin-payment";
import type { Page } from "@/schemas/catalog";
import { BookingClientError } from "./booking-client";

// Presentation inputs only; mapped from the authorized P04 (/api/account/tickets) and P03 (/api/admin/payments)
// contracts below, never read directly from HTTP DTOs by components.
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

const PAGE_SIZE = 10;
const ticketFilters = ["valid", "pending", "expired"];
const reviewReasonLabels: Record<ReviewReason, string | null> = {
  confirmed_success: null,
  unmatched_payment_code: "Nội dung chuyển khoản không khớp mã thanh toán nào",
  underpaid: "Số tiền nhận thấp hơn tổng hóa đơn",
  invoice_already_paid: "Hóa đơn đã được thanh toán bởi giao dịch khác",
  invoice_not_payable: "Hóa đơn không còn ở trạng thái nhận thanh toán",
  departure_not_selling: "Chuyến không còn mở bán khi nhận tiền",
  no_tickets: "Hóa đơn không còn vé để xác nhận",
  departure_already_started: "Tiền đến sau giờ khởi hành",
  seats_taken: "Ghế của hóa đơn đã thuộc khách khác",
  unexplained: "Dữ liệu hiện tại không còn giải thích được, cần kiểm tra thủ công",
};

// P04 reports a Pending hold past its deadline through hold_expired; the card then reads as expired, from the
// server's clock rather than the device's.
export function ticketViewFromDto(dto: TicketDto): TicketView {
  return {
    id: dto.detail_id, invoiceId: dto.invoice_id,
    invoiceStatus: dto.hold_expired && dto.invoice_status === "Pending" ? "Expired" : dto.invoice_status,
    status: dto.status, issuedCode: dto.ticket_code, tripName: dto.trip_name, departureAt: dto.departure_date,
    passengerName: dto.passenger_name, seatLabel: dto.seat_name, pickupName: dto.pickup.name,
    pickupAddress: dto.pickup.address, pickupAt: dto.pickup.pickup_time, unitPrice: dto.unit_price,
    responsibleName: dto.responsible_name_snapshot,
  };
}

export function paymentReviewViewFromDto(dto: AdminPaymentSummaryDto): PaymentReviewView {
  return {
    id: dto.payment_id, transactionReference: dto.transaction_id, receivedAt: dto.created_at, receivedAmount: dto.amount,
    status: dto.status, reason: reviewReasonLabels[dto.review_reason] ?? null,
    invoice: dto.invoice && { id: dto.invoice.invoice_id, paymentCode: dto.invoice.payment_code,
      totalAmount: dto.invoice.total_amount, status: dto.invoice.status as InvoiceDto["status"],
      tripName: dto.invoice.departure.trip_name, responsibleName: dto.invoice.responsible_name_snapshot },
  };
}

// The admin search box takes either a SePay transaction id (digits) or a payment code; P03 matches both partially.
export function adminPaymentSearch(query: PrivateQuery): URLSearchParams {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(PAGE_SIZE) });
  if (query.filter === "NeedsReview" || query.filter === "Success") params.set("status", query.filter);
  const term = query.query.trim();
  if (term) params.set(/^\d+$/.test(term) ? "transaction_id" : "payment_code", term);
  return params;
}

export function ticketSearch(query: PrivateQuery): URLSearchParams {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(PAGE_SIZE) });
  if (ticketFilters.includes(query.filter)) params.set("status", query.filter);
  return params;
}

async function readPrivateJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new BookingClientError(response.status, body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "Không thể tải dữ liệu lúc này.");
  }
  if (!body?.data) throw new BookingClientError(502, "INVALID_RESPONSE", "Dữ liệu trả về không hợp lệ.");
  return body.data as T;
}

function toPrivatePage<D, V>(page: Page<D>, map: (item: D) => V): PrivatePage<V> {
  return { items: page.items.map(map), page: page.pagination.page, totalPages: page.pagination.totalPages,
    totalItems: page.pagination.totalItems };
}

export const customerTicketSource: PrivatePageSource<TicketView> = async (query, signal) =>
  toPrivatePage(await readPrivateJson<Page<TicketDto>>(`/api/account/tickets?${ticketSearch(query)}`, signal), ticketViewFromDto);

export const adminPaymentSource: PrivatePageSource<PaymentReviewView> = async (query, signal) =>
  toPrivatePage(await readPrivateJson<Page<AdminPaymentSummaryDto>>(`/api/admin/payments?${adminPaymentSearch(query)}`, signal),
    paymentReviewViewFromDto);
