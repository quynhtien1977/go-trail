// L03 (Leader UI): pure presentation helpers and the browser client for the L01/L02 endpoints.
// Kept free of React and server imports so the rules below are unit-testable.
import type { CheckInResultDto, ManifestDto, ManifestPassengerDto } from "@/schemas/checkin";
import type { EndedDepartureDto } from "@/schemas/departure";

export type LeaderDepartureStatus = ManifestDto["departure"]["status"];
export type CheckInStatus = ManifestPassengerDto["check_in_status"];

export type LeaderDepartureSummary = {
  departure_id: number;
  departure_date: string;
  status: string;
  is_demo: boolean;
  trip: { trip_id: number; name: string; city: string; location_name: string };
};

// ---------- Trip list ----------

export type TripTab = "upcoming" | "running" | "ended";
export const tripTabs: readonly { id: TripTab; label: string }[] = [
  { id: "upcoming", label: "Sắp đi" },
  { id: "running", label: "Đang chạy" },
  { id: "ended", label: "Đã kết thúc" },
];

export function tripTabOf(status: string): TripTab | null {
  if (status === "Confirmed") return "upcoming";
  if (status === "Running") return "running";
  if (status === "Ended") return "ended";
  return null;
}

// Opens on the tab the Leader most likely needs: a running trip first, then the next one.
export function defaultTripTab(departures: readonly { status: string }[]): TripTab {
  if (departures.some((item) => item.status === "Running")) return "running";
  if (departures.some((item) => item.status === "Confirmed")) return "upcoming";
  return departures.length ? "ended" : "upcoming";
}

export function countByTab(departures: readonly { status: string }[]): Record<TripTab, number> {
  const counts: Record<TripTab, number> = { upcoming: 0, running: 0, ended: 0 };
  for (const item of departures) {
    const tab = tripTabOf(item.status);
    if (tab) counts[tab] += 1;
  }
  return counts;
}

// Ended trips read best newest first; upcoming and running keep the server's ascending date order.
export function departuresForTab<T extends { status: string; departure_date: string }>(departures: readonly T[], tab: TripTab): T[] {
  const list = departures.filter((item) => tripTabOf(item.status) === tab);
  return tab === "ended" ? [...list].sort((a, b) => b.departure_date.localeCompare(a.departure_date)) : list;
}

export const departureStatusLabel: Record<LeaderDepartureStatus, string> = {
  Confirmed: "Đã chốt chạy",
  Running: "Đang chạy",
  Ended: "Đã kết thúc",
};

// ---------- Manifest ----------

export type PassengerFilter = "all" | CheckInStatus;
export const passengerFilters: readonly { id: PassengerFilter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "Pending", label: "Chưa đến" },
  { id: "CheckedIn", label: "Đã check-in" },
  { id: "Absent", label: "Vắng" },
];

export function foldVietnamese(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

// Search by name (accent-insensitive), phone digits or seat/plate; the Leader types fast on a phone.
export function matchesPassenger(passenger: ManifestPassengerDto, rawQuery: string): boolean {
  const query = foldVietnamese(rawQuery.trim());
  if (!query) return true;
  const digits = query.replace(/\D/g, "");
  if (digits.length >= 3 && passenger.passenger_phone.replace(/\D/g, "").includes(digits)) return true;
  const haystack = foldVietnamese([passenger.passenger_name, passenger.seat_name, passenger.vehicle.plate_number].join(" "));
  return query.split(/\s+/).every((part) => haystack.includes(part));
}

export type PickupGroup = {
  key: number;
  name: string;
  address: string;
  pickup_time: string;
  passengers: ManifestPassengerDto[];
};

// The manifest arrives ordered by pickup time then seat (PRD 5.4); grouping keeps that order.
export function groupByPickup(passengers: readonly ManifestPassengerDto[]): PickupGroup[] {
  const groups = new Map<number, PickupGroup>();
  for (const passenger of passengers) {
    const { dep_pickup_id, name, address, pickup_time } = passenger.pickup;
    let group = groups.get(dep_pickup_id);
    if (!group) {
      group = { key: dep_pickup_id, name, address, pickup_time, passengers: [] };
      groups.set(dep_pickup_id, group);
    }
    group.passengers.push(passenger);
  }
  return [...groups.values()];
}

export function filterPassengers(passengers: readonly ManifestPassengerDto[], filter: PassengerFilter, query: string) {
  return passengers.filter((item) => (filter === "all" || item.check_in_status === filter) && matchesPassenger(item, query));
}

export function summarize(passengers: readonly ManifestPassengerDto[]): ManifestDto["summary"] {
  const count = (status: CheckInStatus) => passengers.filter((item) => item.check_in_status === status).length;
  return { total: passengers.length, checked_in: count("CheckedIn"), absent: count("Absent"), pending: count("Pending") };
}

// Applies a check-in/absent result to the local manifest so the screen updates without a refetch.
export function applyPassengerUpdate(manifest: ManifestDto, updated: ManifestPassengerDto): ManifestDto {
  if (!manifest.passengers.some((item) => item.detail_id === updated.detail_id)) return manifest;
  const passengers = manifest.passengers.map((item) => (item.detail_id === updated.detail_id ? updated : item));
  return { ...manifest, passengers, summary: summarize(passengers) };
}

// ---------- Ticket codes and scanning ----------

const ticketCodePattern = /^[A-Za-z0-9_-]{1,64}$/;

// Mirrors the server schema (trim, allowlist, uppercase) so bad input is caught before a request.
export function normalizeTicketCode(raw: string): string | null {
  const code = raw.trim();
  return ticketCodePattern.test(code) ? code.toUpperCase() : null;
}

// Swallows repeated reads of the same QR while it stays in front of the camera: every sighting
// extends the window, so a ticket held still fires once and fires again only after it left the frame.
export class ScanDebouncer {
  private last: { code: string; at: number } | null = null;
  constructor(private readonly windowMs = 3000) {}
  accept(code: string, now: number): boolean {
    if (this.last && this.last.code === code && now - this.last.at < this.windowMs) {
      this.last.at = now;
      return false;
    }
    this.last = { code, at: now };
    return true;
  }
  reset() { this.last = null; }
}

export type Tone = "success" | "warning" | "danger" | "neutral";
export type ScanOutcome = {
  tone: Tone;
  title: string;
  detail?: string;
  passenger?: ManifestPassengerDto;
};

export function describeCheckInResult(result: CheckInResultDto): ScanOutcome {
  const { passenger } = result;
  switch (result.result) {
    case "CheckedIn":
      return { tone: "success", title: "Check-in thành công", passenger };
    case "AlreadyCheckedIn":
      return { tone: "warning", title: "Khách đã check-in trước đó",
        detail: passenger.check_in_time ? `Lúc ${formatClock(passenger.check_in_time)}.` : undefined, passenger };
    case "MarkedAbsent":
      return { tone: "neutral", title: "Đã đánh dấu vắng", passenger };
    case "AlreadyAbsent":
      return { tone: "neutral", title: "Khách đã được đánh dấu vắng trước đó", passenger };
  }
}

// Error codes come from src/server/errors.ts; the wording avoids technical terms (DESIGN.md rule 5).
export function describeLeaderError(code: string, status: number): ScanOutcome {
  switch (code) {
    case "TICKET_NOT_FOUND":
      return { tone: "danger", title: "Không tìm thấy vé", detail: "Mã không khớp với vé nào. Kiểm tra lại mã trên vé của khách." };
    case "TICKET_WRONG_DEPARTURE":
      return { tone: "danger", title: "Vé thuộc chuyến khác", detail: "Vé này không phải của chuyến đang check-in." };
    case "TICKET_NOT_VALID":
      return { tone: "danger", title: "Vé không hợp lệ", detail: "Vé chưa được thanh toán hoặc đã bị hủy." };
    case "CHECKIN_CLOSED":
      return { tone: "neutral", title: "Chuyến đã kết thúc", detail: "Không thể check-in hoặc đánh dấu vắng nữa." };
    case "ALREADY_CHECKED_IN":
      return { tone: "warning", title: "Khách đã check-in", detail: "Khách đã quét vé nên không thể đánh dấu vắng." };
    case "INVALID_QR":
    case "INVALID_INPUT":
      return { tone: "danger", title: "Mã không hợp lệ", detail: "Đây không phải mã vé Go-Trail. Quét lại vé hoặc nhập mã bằng tay." };
    case "RATE_LIMITED":
      return { tone: "warning", title: "Thao tác quá nhanh", detail: "Vui lòng chờ vài giây rồi thử lại." };
    case "UNAUTHENTICATED":
      return { tone: "danger", title: "Phiên đăng nhập đã hết", detail: "Vui lòng đăng nhập lại." };
    case "NOT_FOUND":
    case "FORBIDDEN":
      return { tone: "danger", title: "Không có quyền với chuyến này", detail: "Chuyến không còn được phân công cho bạn." };
    case "RESOURCE_CONFLICT":
      return { tone: "warning", title: "Trạng thái chuyến đã thay đổi", detail: "Tải lại để xem trạng thái mới nhất." };
    case "NETWORK_ERROR":
      return { tone: "danger", title: "Mất kết nối", detail: "Không gửi được yêu cầu. Kiểm tra mạng rồi bấm thử lại." };
    default:
      return { tone: "danger", title: "Không thực hiện được", detail: status >= 500 ? "Hệ thống đang bận. Vui lòng thử lại." : undefined };
  }
}

// Retrying is only useful when nothing reached the server or the server failed.
export function isRetryable(code: string, status: number): boolean {
  return code === "NETWORK_ERROR" || code === "RATE_LIMITED" || status >= 500;
}

// ---------- Formatting (Vietnam time, PRD) ----------

const timeZone = "Asia/Ho_Chi_Minh";
export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
export function formatDepartureDate(iso: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("vi-VN", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  return `${formatClock(iso)}, ${day}`;
}
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : phone;
}
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// ---------- Browser client ----------

export class LeaderClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

async function request<T>(url: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new LeaderClientError(0, "NETWORK_ERROR", "Mất kết nối.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new LeaderClientError(response.status, payload?.error?.code ?? "REQUEST_FAILED", payload?.error?.message ?? "Không thực hiện được.");
  }
  if (!payload?.data) throw new LeaderClientError(502, "INVALID_RESPONSE", "Dữ liệu chưa sẵn sàng.");
  return payload.data as T;
}

export const leaderClient = {
  readManifest: (departureId: number, signal?: AbortSignal) =>
    request<ManifestDto>(`/api/leader/departures/${departureId}/manifest`, signal),
  checkIn: (departureId: number, ticketCode: string, signal?: AbortSignal) =>
    request<CheckInResultDto>("/api/checkin", signal, { action: "CheckIn", departure_id: departureId, ticket_code: ticketCode }),
  markAbsent: (departureId: number, detailId: number, signal?: AbortSignal) =>
    request<CheckInResultDto>("/api/checkin", signal, { action: "MarkAbsent", departure_id: departureId, detail_id: detailId }),
  endDeparture: (departureId: number, signal?: AbortSignal) =>
    request<EndedDepartureDto>(`/api/leader/departures/${departureId}/end`, signal, {}),
};
