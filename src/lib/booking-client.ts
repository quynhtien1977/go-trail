import type { SeatMapDto } from "@/schemas/seat-map";
import type { InvoiceDto } from "@/schemas/invoice";
import type { HoldDto, HoldSeatsInput } from "@/schemas/booking";
import type { Page, PickupDto } from "@/schemas/catalog";

export class BookingClientError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function readBookingData<T>(url: string, signal: AbortSignal, request?: { method: "POST"; body: string }): Promise<T> {
  const response = await fetch(url, { ...request, headers: { Accept: "application/json", ...(request ? { "Content-Type": "application/json" } : {}) }, cache: "no-store", signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new BookingClientError(response.status, body?.error?.code ?? "REQUEST_FAILED",
    body?.error?.message ?? "Không thể tải thông tin. Vui lòng thử lại.");
  if (!body?.data) throw new BookingClientError(502, "INVALID_RESPONSE", "Thông tin chưa sẵn sàng. Vui lòng thử lại.");
  return body.data as T;
}

export function fetchDepartureSeats(id: number, signal: AbortSignal) {
  return readBookingData<SeatMapDto>(`/api/departures/${id}/seats`, signal);
}

export function fetchInvoice(id: number, signal: AbortSignal) {
  return readBookingData<InvoiceDto>(`/api/invoices/${id}`, signal);
}

export function createSeatHold(id: number, input: HoldSeatsInput, signal: AbortSignal): Promise<HoldDto> {
  return readBookingData<HoldDto>(`/api/departures/${id}/holds`, signal, { method: "POST", body: JSON.stringify(input) });
}

export function fetchBookingPickupPreferences(tripId: number, page: number, signal: AbortSignal): Promise<Page<PickupDto>> {
  return readBookingData<Page<PickupDto>>(`/api/trips/${tripId}/pickups?page=${page}&pageSize=50`, signal);
}
