import type { Page } from "@/schemas/catalog";
import type { MaintenanceDto, SeatDto, VehicleDto, VehicleSummaryDto, vehicleStatuses } from "@/schemas/fleet";
import type { StaffDto, staffStatuses, staffTypes } from "@/schemas/staff";
import type { ManagedDepartureDto, departureStatuses } from "@/schemas/departure";
import type { AssignmentDto } from "@/schemas/assignment";

// Client for the Staff operations portal (O01-O05). Every rule is enforced on the server;
// the UI only mirrors it to explain failures before and after a request.

export type VehicleStatus = (typeof vehicleStatuses)[number];
export type StaffType = (typeof staffTypes)[number];
export type StaffStatus = (typeof staffStatuses)[number];
export type DepartureStatus = (typeof departureStatuses)[number];
export type CrewRole = "Driver" | "Assistant" | "Leader";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
  }
}

type Query = Record<string, string | number | undefined>;

function withQuery(url: string, query?: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${url}?${text}` : url;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.", 0, "NETWORK_ERROR");
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const error = payload?.error;
    throw new ApiError(error?.message || `Yêu cầu thất bại (${res.status}).`, res.status, error?.code || "UNKNOWN");
  }
  return payload.data as T;
}

const get = <T>(url: string, query?: Query) => request<T>("GET", withQuery(url, query));
const post = <T>(url: string, body: unknown) => request<T>("POST", url, body);
const patch = <T>(url: string, body: unknown) => request<T>("PATCH", url, body);
const del = <T>(url: string) => request<T>("DELETE", url);

// ---------------------------------------------------------------------------
// O01 — Vehicles, seat maps and maintenance (HRMgr, Admin)
// ---------------------------------------------------------------------------
export type SeatInput = { seat_name: string; floor_level: number; x_position: number; y_position: number };

export const fleetApi = {
  list: (query: { page?: number; pageSize?: number; status?: VehicleStatus }) =>
    get<Page<VehicleSummaryDto>>("/api/staff/vehicles", query),
  read: (id: number) => get<VehicleDto>(`/api/staff/vehicles/${id}`),
  create: (input: { plate_number: string; vehicle_type: string; seats: SeatInput[] }) =>
    post<VehicleDto>("/api/staff/vehicles", input),
  update: (id: number, input: { plate_number?: string; vehicle_type?: string; status?: VehicleStatus }) =>
    patch<VehicleDto>(`/api/staff/vehicles/${id}`, input),
  deactivate: (id: number) => del<VehicleDto>(`/api/staff/vehicles/${id}`),
  addSeat: (id: number, input: SeatInput) => post<SeatDto>(`/api/staff/vehicles/${id}/seats`, input),
  updateSeat: (id: number, seatId: number, input: Partial<SeatInput> & { is_active?: boolean }) =>
    patch<SeatDto>(`/api/staff/vehicles/${id}/seats/${seatId}`, input),
  listMaintenance: (id: number, query: { page?: number; pageSize?: number }) =>
    get<Page<MaintenanceDto>>(`/api/staff/vehicles/${id}/maintenance`, query),
  createMaintenance: (id: number, input: { start_date: string; end_date: string; description: string; cost: string }) =>
    post<MaintenanceDto>(`/api/staff/vehicles/${id}/maintenance`, input),
};

// ---------------------------------------------------------------------------
// O02 — Personnel and Leader accounts (HRMgr, Admin)
// ---------------------------------------------------------------------------
export type StaffCreateInput = {
  full_name: string; phone: string; staff_type: StaffType;
  license_number?: string | null; license_class?: string | null; license_expiry?: string | null;
  account?: { email: string; password: string };
};
export type StaffPatch = {
  full_name?: string; phone?: string; status?: StaffStatus;
  license_number?: string | null; license_class?: string | null; license_expiry?: string | null;
};

export const personnelApi = {
  list: (query: { page?: number; pageSize?: number; staff_type?: StaffType; status?: StaffStatus }) =>
    get<Page<StaffDto>>("/api/staff/personnel", query),
  create: (input: StaffCreateInput) => post<StaffDto>("/api/staff/personnel", input),
  update: (id: number, input: StaffPatch) => patch<StaffDto>(`/api/staff/personnel/${id}`, input),
  deactivate: (id: number) => del<StaffDto>(`/api/staff/personnel/${id}`),
};

// ---------------------------------------------------------------------------
// O03/O05 — Departures, pickup schedule, invoice owner and status (RouteMgr, Admin)
// ---------------------------------------------------------------------------
export type DepartureInput = {
  departure_date: string; booking_deadline: string; min_passengers: number; price_override?: string | null;
  pickups: { pickup_id: number; pickup_time: string }[]; invoice_owner_user_id?: number;
};

export const departureApi = {
  list: (tripId: number, query: { page?: number; pageSize?: number; status?: DepartureStatus }) =>
    get<Page<ManagedDepartureDto>>(`/api/staff/trips/${tripId}/departures`, query),
  read: (id: number) => get<ManagedDepartureDto>(`/api/staff/departures/${id}`),
  create: (tripId: number, input: DepartureInput) =>
    post<ManagedDepartureDto>(`/api/staff/trips/${tripId}/departures`, input),
  update: (id: number, input: Partial<DepartureInput>) => patch<ManagedDepartureDto>(`/api/staff/departures/${id}`, input),
  setStatus: (id: number, status: DepartureStatus) => patch<ManagedDepartureDto>(`/api/staff/departures/${id}`, { status }),
};

// ---------------------------------------------------------------------------
// O04 — Vehicle and crew assignments (HRMgr, Admin; RouteMgr/Leader read-only)
// ---------------------------------------------------------------------------
export const assignmentApi = {
  read: (departureId: number) => get<AssignmentDto>(`/api/staff/departures/${departureId}/assignments`),
  assignVehicle: (departureId: number, vehicleId: number) =>
    post<AssignmentDto>(`/api/staff/departures/${departureId}/vehicles`, { vehicle_id: vehicleId }),
  unassignVehicle: (departureId: number, vehicleId: number) =>
    del<AssignmentDto>(`/api/staff/departures/${departureId}/vehicles/${vehicleId}`),
  assignStaff: (departureId: number, input: { staff_id: number; vehicle_id: number; role_in_trip: CrewRole; replace_dep_staff_id?: number }) =>
    post<AssignmentDto>(`/api/staff/departures/${departureId}/staff`, input),
  unassignStaff: (departureId: number, assignmentId: number) =>
    del<AssignmentDto>(`/api/staff/departures/${departureId}/staff/${assignmentId}`),
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
export function errorMessage(error: unknown, fallback = "Đã xảy ra lỗi. Vui lòng thử lại."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Converts a UTC ISO instant to the value of an <input type="datetime-local"> in Asia/Ho_Chi_Minh. */
export function toVietnamLocalInput(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return shifted.toISOString().slice(0, 16);
}

/** Converts an <input type="datetime-local"> value entered in Vietnam time (UTC+7) to an ISO instant. */
export function fromVietnamLocalInput(value: string): string {
  return new Date(`${value}:00+07:00`).toISOString();
}

export function formatVietnamDate(iso: string, withTime = true): string {
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
