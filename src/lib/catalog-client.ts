import type {
  TripDto,
  TripSummaryDto,
  PickupDto,
  DepartureDto,
  Page,
  TripInput,
  TripPatch,
} from "@/schemas/catalog";
import toursData from "./fixtures/gotrail-tours.json";

import { getLegacyMediaUrl } from "@/lib/legacy-media";

export const FALLBACK_TRIP_IMAGE = getLegacyMediaUrl(
  "shared-bus-background",
  "https://anqtlegcsrqzqenytrjo.supabase.co/storage/v1/object/public/gotrail-media/site/banners/d7cf75bcc0e815c69d0988e6cdee4add198766fc1dbac81e8c408049ccad1db8.webp"
);

interface FixtureTour {
  slug: string;
  link: string;
  img: string;
  tags?: string[];
  time?: string;
  difficultyIcon?: string;
}

const fixtureMap = new Map<string, FixtureTour>();
for (const item of toursData as FixtureTour[]) {
  if (item.link) {
    fixtureMap.set(item.link.trim(), item);
    // Also map normalized key without trailing slash
    fixtureMap.set(item.link.trim().replace(/\/+$/, ""), item);
  }
  if (item.slug) {
    fixtureMap.set(item.slug.trim(), item);
  }
}

/**
 * Maps a trip to an image and metadata based on its source_url or slug,
 * with graceful fallback for manual / custom trips.
 */
export function getTripMedia(trip: { source_url?: string | null; name?: string }): {
  image: string;
  tags: string[];
  difficultyIcon: string;
} {
  if (trip.source_url) {
    const rawUrl = trip.source_url.trim();
    const matched =
      fixtureMap.get(rawUrl) || fixtureMap.get(rawUrl.replace(/\/+$/, ""));
    if (matched) {
      return {
        image: matched.img || FALLBACK_TRIP_IMAGE,
        tags: matched.tags || [],
        difficultyIcon: matched.difficultyIcon || "/ref/i-do-kho-2.svg",
      };
    }
  }

  // Fallback for manual or unmatched trips
  return {
    image: FALLBACK_TRIP_IMAGE,
    tags: ["Trekking", "Xe bus khứ hồi", "Leader dẫn đoàn"],
    difficultyIcon: "/ref/i-do-kho-2.svg",
  };
}

/**
 * Formats Decimal/string VND amount into readable Vietnamese currency format.
 */
export function formatVnd(amount: string | number): string {
  try {
    const num = typeof amount === "string" ? parseInt(amount, 10) : amount;
    if (Number.isNaN(num)) return "0 đ";
    return `${num.toLocaleString("vi-VN")} đ`;
  } catch {
    return `${amount} đ`;
  }
}

/**
 * Formats UTC ISO string to Vietnam date/time string (Asia/Ho_Chi_Minh).
 */
export function formatVietnamDateTime(
  utcIso: string,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    const date = new Date(utcIso);
    return date.toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      ...options,
    });
  } catch {
    return utcIso;
  }
}

// ---------------------------------------------------------------------------
// PUBLIC API CALLS
// ---------------------------------------------------------------------------

export async function fetchPublicTrips(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
  city?: string;
}): Promise<Page<TripSummaryDto>> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.q?.trim()) query.set("q", params.q.trim());
  if (params?.city?.trim()) query.set("city", params.city.trim());

  const res = await fetch(`/api/trips?${query.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Lỗi tải danh sách tuyến (${res.status})`
    );
  }

  const json = await res.json();
  return json.data;
}

export async function fetchPublicTripDetail(
  id: number | string
): Promise<TripDto> {
  const res = await fetch(`/api/trips/${id}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Không tìm thấy tuyến trekking (#${id})`
    );
  }

  const json = await res.json();
  return json.data;
}

export async function fetchPublicTripPickupsPage(
  tripId: number | string,
  params?: { page?: number; pageSize?: number }
): Promise<Page<PickupDto>> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  const queryString = query.toString() ? `?${query.toString()}` : "";

  const res = await fetch(`/api/trips/${tripId}/pickups${queryString}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Không thể tải điểm đón (${res.status})`
    );
  }

  const json = await res.json();
  return json.data;
}

export async function fetchPublicTripPickups(
  tripId: number | string,
  params?: { page?: number; pageSize?: number }
): Promise<PickupDto[]> {
  const page = await fetchPublicTripPickupsPage(tripId, {
    pageSize: 50,
    ...params,
  });
  return page.items || [];
}

export async function fetchPublicTripDeparturesPage(
  tripId: number | string,
  params?: { page?: number; pageSize?: number }
): Promise<Page<DepartureDto>> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  const queryString = query.toString() ? `?${query.toString()}` : "";

  const res = await fetch(`/api/trips/${tripId}/departures${queryString}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Không thể tải lịch khởi hành (${res.status})`
    );
  }

  const json = await res.json();
  return json.data;
}

export async function fetchPublicTripDepartures(
  tripId: number | string,
  params?: { page?: number; pageSize?: number }
): Promise<DepartureDto[]> {
  const page = await fetchPublicTripDeparturesPage(tripId, {
    pageSize: 50,
    ...params,
  });
  return page.items || [];
}

// ---------------------------------------------------------------------------
// STAFF MANAGEMENT API CALLS (RouteMgr & Admin)
// ---------------------------------------------------------------------------

export async function fetchStaffTrips(params?: {
  page?: number;
  pageSize?: number;
}): Promise<Page<TripSummaryDto>> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));

  const res = await fetch(`/api/staff/trips?${query.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message ||
        `Lỗi tải danh sách quản lý tuyến (${res.status})`
    );
  }

  const json = await res.json();
  return json.data;
}

export async function createStaffTrip(data: TripInput): Promise<TripDto> {
  const res = await fetch("/api/staff/trips", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Không thể tạo mới tuyến (${res.status})`
    );
  }

  const json = await res.json();
  return json.data;
}

export async function updateStaffTrip(
  id: number,
  data: TripPatch
): Promise<TripDto> {
  const res = await fetch(`/api/staff/trips/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Không thể cập nhật tuyến (${res.status})`
    );
  }

  const json = await res.json();
  return json.data;
}

export async function retireStaffTrip(id: number): Promise<TripDto> {
  const res = await fetch(`/api/staff/trips/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Không thể tạm ẩn tuyến (#${id})`
    );
  }

  const json = await res.json();
  return json.data;
}

export async function fetchStaffPickups(
  tripId: number
): Promise<PickupDto[]> {
  const res = await fetch(`/api/staff/trips/${tripId}/pickups`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Lỗi tải điểm đón quản lý (${res.status})`
    );
  }

  const json = await res.json();
  return json.data.items || [];
}

export async function createStaffPickup(
  tripId: number,
  data: { name: string; address: string }
): Promise<PickupDto> {
  const res = await fetch(`/api/staff/trips/${tripId}/pickups`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Không thể tạo điểm đón (${res.status})`
    );
  }

  const json = await res.json();
  return json.data;
}

export async function updateStaffPickup(
  tripId: number,
  pickupId: number,
  data: { name?: string; address?: string; is_active?: boolean }
): Promise<PickupDto> {
  const res = await fetch(`/api/staff/trips/${tripId}/pickups/${pickupId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Không thể cập nhật điểm đón (${res.status})`
    );
  }

  const json = await res.json();
  return json.data;
}

export async function retireStaffPickup(
  tripId: number,
  pickupId: number
): Promise<PickupDto> {
  const res = await fetch(`/api/staff/trips/${tripId}/pickups/${pickupId}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Không thể tạm ẩn điểm đón (${res.status})`
    );
  }

  const json = await res.json();
  return json.data;
}
