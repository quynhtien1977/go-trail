// Q04 admin screens: dashboard, audit log and system settings — labels, pure helpers and the browser client
// for the admin APIs (SCRUM-45/46/49): /api/admin/reports/revenue, /api/staff/dashboard, /api/admin/audit,
// /api/admin/settings. No React or server imports, so it is unit-tested.

import type { Role } from "@/schemas/auth";
import type { Page, TripSummaryDto } from "@/schemas/catalog";
import { settingRanges } from "@/schemas/admin";
import { ROLE_LABELS, STATUS_LABELS, formatCount, formatVnd, request, type AccountStatus } from "@/lib/customer-account-ui";

// ---------- Shared labels ----------

export const DEPARTURE_STATUS_LABELS = {
  Draft: "Nháp", Open: "Đang mở bán", Closed: "Đã chốt bán", Confirmed: "Đã xác nhận",
  Running: "Đang chạy", Ended: "Đã kết thúc", Cancelled: "Đã hủy", Rescheduled: "Đã dời lịch",
} as const;
export const VEHICLE_STATUS_LABELS = { Ready: "Sẵn sàng", Maintenance: "Đang bảo dưỡng", Inactive: "Ngừng hoạt động" } as const;

// ---------- Dates (reports take YYYY-MM-DD in Vietnam time) ----------

const vnDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" });
export function vietnamDate(date: Date): string {
  return vnDate.format(date);
}
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}
export function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}
export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

// ---------- Dashboard ----------

export type DashboardPeriod = "today" | "7d" | "30d" | "month";
export const DASHBOARD_PERIODS: readonly { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Hôm nay" }, { value: "7d", label: "7 ngày gần nhất" },
  { value: "30d", label: "30 ngày gần nhất" }, { value: "month", label: "Tháng này" },
];
export type DateRange = { from: string; to: string };

export function periodRange(period: DashboardPeriod, now: Date): DateRange {
  const today = vietnamDate(now);
  if (period === "today") return { from: today, to: today };
  if (period === "7d") return { from: addDays(today, -6), to: today };
  if (period === "30d") return { from: addDays(today, -29), to: today };
  return { from: `${today.slice(0, 8)}01`, to: today };
}
// Same length window immediately before `range`, for the growth figure.
export function previousRange(range: DateRange): DateRange {
  const length = daysBetween(range.from, range.to);
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

export type RevenueMetrics = {
  ticket_revenue: string; received: string; surplus: string; needs_review_amount: string;
  needs_review_count: number; pending: number; paid: number; expired: number;
};
export type RevenueReport = { group_by: "day" | "trip" | "departure"; totals: RevenueMetrics; groups: (RevenueMetrics & { bucket: string | null })[] };
export type StaffDashboard = {
  operations: { departures: number; vehicles: number; staff: number; seats: number; seats_sold: number };
  passengers?: { bookers: number; valid_tickets: number; checked_in: number };
  warehouse_low_stock_now?: { items: { item_id: number; name: string; unit: string; low_stock_threshold: number | null; on_hand: number }[]; next_cursor: number | null };
  revenue?: RevenueMetrics;
};

// Fills days without payments with 0 so the chart has one bar per day of the range.
export function dailySeries(range: DateRange, report: RevenueReport): { date: string; amount: number }[] {
  const byDay = new Map(report.groups.map((group) => [group.bucket, Number(group.ticket_revenue)]));
  return Array.from({ length: daysBetween(range.from, range.to) }, (_, index) => {
    const date = addDays(range.from, index);
    return { date, amount: byDay.get(date) ?? 0 };
  });
}

export type RouteRevenue = { label: string; amount: number; other?: boolean };
// Top `limit` trips by ticket revenue, the rest folded into "Các tuyến khác"; parts always add up to the total.
export function routeBreakdown(report: RevenueReport, tripNames: ReadonlyMap<number, string>, limit = 4): RouteRevenue[] {
  const rows = report.groups
    .map((group) => ({ id: Number(group.bucket), amount: Number(group.ticket_revenue) }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const top = rows.slice(0, limit).map((row) => ({ label: tripNames.get(row.id) ?? `Tuyến #${row.id}`, amount: row.amount }));
  const rest = sum(rows.slice(limit).map((row) => row.amount));
  return rest > 0 ? [...top, { label: "Các tuyến khác", amount: rest, other: true }] : top;
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
export function percent(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${(Math.round((part / whole) * 1000) / 10).toLocaleString("vi-VN")}%`;
}
export function growth(current: number, previous: number): string | null {
  if (previous <= 0) return null;
  const value = Math.round(((current - previous) / previous) * 1000) / 10;
  return `${value > 0 ? "+" : ""}${value.toLocaleString("vi-VN")}%`;
}
export function formatMoney(value: number | string): string {
  return formatVnd(String(typeof value === "number" ? Math.round(value) : value));
}
// Short axis label: 30.400.000 → "30,4tr".
export function formatMillions(value: number): string {
  return `${(Math.round(value / 100_000) / 10).toLocaleString("vi-VN")}tr`;
}

function rangeParams(range: DateRange, extra: Record<string, string> = {}) {
  return new URLSearchParams({ from_date: range.from, to_date: range.to, ...extra });
}
export const dashboardClient = {
  revenue: (range: DateRange, groupBy: "day" | "trip", signal?: AbortSignal) =>
    request<RevenueReport>(`/api/admin/reports/revenue?${rangeParams(range, { group_by: groupBy })}`, signal),
  operations: (range: DateRange, signal?: AbortSignal) => request<StaffDashboard>(`/api/staff/dashboard?${rangeParams(range)}`, signal),
  trips: (signal?: AbortSignal) => request<Page<TripSummaryDto>>("/api/staff/trips?page=1&pageSize=50", signal),
};

// ---------- System settings (SYSTEM_SETTINGS; ranges come from the server schema) ----------

export type SettingKey = keyof typeof settingRanges;
export type SettingField = { key: SettingKey; label: string; unit: string; min: number; max: number; help: string };

const SETTING_TEXT: Record<SettingKey, Omit<SettingField, "key" | "min" | "max">> = {
  SEAT_TTL_MINUTES: { label: "Thời gian giữ ghế", unit: "phút", help: "Hóa đơn chưa thanh toán sau thời gian này sẽ hết hạn và ghế được nhả lại." },
  MAX_SEATS_PER_INVOICE: { label: "Số ghế tối đa mỗi hóa đơn", unit: "ghế", help: "Giới hạn số ghế khách chọn trong một lần đặt." },
  LEADER_RATIO: { label: "Số khách cho mỗi Leader", unit: "khách", help: "Số Leader tối thiểu của chuyến = số vé hợp lệ chia cho giá trị này, làm tròn lên." },
};
export const SETTING_FIELDS: readonly SettingField[] = (["SEAT_TTL_MINUTES", "MAX_SEATS_PER_INVOICE", "LEADER_RATIO"] as const)
  .map((key) => ({ key, ...SETTING_TEXT[key], min: settingRanges[key][0], max: settingRanges[key][1] }));
const DEFAULTS: Record<SettingKey, string> = { SEAT_TTL_MINUTES: "15", MAX_SEATS_PER_INVOICE: "10", LEADER_RATIO: "15" };

export type SettingValues = Record<SettingKey, string>;
export type SettingRow = { setting_key: string; setting_value: string; description?: string | null };

export function settingValuesFrom(rows: readonly SettingRow[]): SettingValues {
  const byKey = new Map(rows.map((row) => [row.setting_key, row.setting_value.trim()]));
  return Object.fromEntries(SETTING_FIELDS.map((field) => [field.key, byKey.get(field.key) ?? DEFAULTS[field.key]])) as SettingValues;
}

// Mirrors updateSettingSchema (/^[1-9]\d{0,4}$/) plus the per-key range.
export function validateSetting(field: SettingField, raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return "Vui lòng nhập giá trị.";
  if (!/^\d+$/.test(value)) return "Chỉ nhập số nguyên dương.";
  const number = Number(value);
  if (number < field.min || number > field.max) return `Giá trị phải từ ${field.min} đến ${field.max} ${field.unit}.`;
  return undefined;
}
export function validateSettings(values: SettingValues): Partial<Record<SettingKey, string>> {
  const errors: Partial<Record<SettingKey, string>> = {};
  for (const field of SETTING_FIELDS) {
    const error = validateSetting(field, values[field.key]);
    if (error) errors[field.key] = error;
  }
  return errors;
}
export function changedSettings(saved: SettingValues, draft: SettingValues): SettingKey[] {
  return SETTING_FIELDS.filter((field) => Number(saved[field.key]) !== Number(draft[field.key])).map((field) => field.key);
}
export function minimumLeaders(validTickets: number, leaderRatio: number): number {
  return validTickets <= 0 ? 0 : Math.ceil(validTickets / leaderRatio);
}

export function describeSettingFailure(key: SettingKey, code: string, status: number): string {
  if (status === 409 && key === "LEADER_RATIO") return "Không thể giảm: có chuyến đã xác nhận hoặc đang chạy sẽ thiếu Leader với tỷ lệ mới.";
  if (status === 422) return "Giá trị không hợp lệ.";
  if (status === 403) return "Bạn không có quyền sửa cấu hình.";
  if (status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (status === 404) return "Tham số không còn tồn tại.";
  if (code === "NETWORK_ERROR") return "Mất kết nối. Vui lòng thử lại.";
  return "Chưa lưu được. Vui lòng thử lại.";
}

export const settingsClient = {
  update: (key: SettingKey, value: string, signal?: AbortSignal) =>
    request<SettingRow>(`/api/admin/settings/${key}`, signal, { setting_value: String(Number(value)) }),
};

// ---------- Audit log (GET /api/admin/audit; events are the allowlist in src/server/audit.ts) ----------

export const AUDIT_ACTION_LABELS = {
  SettingChanged: "Đổi cấu hình",
  RoleChanged: "Đổi vai trò",
  AccountStatusChanged: "Khóa / mở khóa tài khoản",
  LeaderAccountCreated: "Tạo tài khoản Leader",
  DepartureStatusChanged: "Đổi trạng thái chuyến",
  DepartureOwnerChanged: "Đổi người phụ trách chuyến",
  TripCreated: "Tạo tuyến",
  TripPriceChanged: "Đổi giá tuyến",
  TripAvailabilityChanged: "Đổi trạng thái mở bán tuyến",
  VehicleStatusChanged: "Đổi trạng thái xe",
  MoneyRecorded: "Ghi nhận tiền",
  SupplyItemCreated: "Tạo vật tư",
  SupplyItemUpdated: "Sửa vật tư",
  SupplyReceived: "Nhập kho vật tư",
  SupplyIssued: "Cấp vật tư cho chuyến",
  SupplyReturned: "Hoàn nhập vật tư",
} as const;
export type AuditAction = keyof typeof AUDIT_ACTION_LABELS;
export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];

export const AUDIT_TABLE_LABELS = {
  users: "Tài khoản", departures: "Chuyến", trips: "Tuyến", vehicles: "Xe", payments: "Thanh toán",
  refunds: "Hoàn tiền", departure_costs: "Chi phí chuyến", vehicle_maintenance: "Bảo dưỡng xe",
  supply_items: "Vật tư", supply_transactions: "Phiếu kho", system_settings: "Cấu hình",
} as const;
export type AuditTable = keyof typeof AUDIT_TABLE_LABELS;
export const AUDIT_TABLE_FILTERS: readonly AuditTable[] = [
  "users", "departures", "trips", "vehicles", "payments", "supply_items", "supply_transactions", "system_settings",
];

const SETTING_LABELS: Record<string, string> = Object.fromEntries(SETTING_FIELDS.map((field) => [field.key, field.label]));

export type AuditEvent = { action: string; record_id?: unknown; [field: string]: unknown };
export type AuditItem = {
  log_id: number; user_id: number; action: string; table_name: string; record_id: string;
  actor_name: string; created_at: string; event: AuditEvent | null;
};

export function auditActionLabel(action: string): string {
  return action in AUDIT_ACTION_LABELS ? AUDIT_ACTION_LABELS[action as AuditAction] : action;
}
export function auditObjectLabel(item: Pick<AuditItem, "table_name" | "record_id">): string {
  if (item.table_name === "system_settings") return SETTING_LABELS[item.record_id] ?? item.record_id;
  const table = item.table_name in AUDIT_TABLE_LABELS ? AUDIT_TABLE_LABELS[item.table_name as AuditTable] : item.table_name;
  return `${table} #${item.record_id}`;
}
export function isAutomatic(item: Pick<AuditItem, "event">): boolean {
  return item.event?.source === "cron";
}

const asString = (value: unknown) => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value));
function label(map: Record<string, string>, value: unknown): string {
  const key = asString(value);
  return map[key] ?? key;
}

export type AuditChange = { before?: string; after?: string; summary: string };

export function describeAuditChange(item: Pick<AuditItem, "action" | "event">): AuditChange {
  const event = item.event;
  if (!event) return { summary: "Không đọc được chi tiết" };
  const pair = (before: string, after: string): AuditChange => ({ before, after, summary: `${before} → ${after}` });
  switch (item.action) {
    case "SettingChanged": {
      const unit = SETTING_FIELDS.find((field) => field.key === event.record_id)?.unit ?? "";
      return pair(`${asString(event.from)} ${unit}`.trim(), `${asString(event.to)} ${unit}`.trim());
    }
    case "RoleChanged":
      return pair(label(ROLE_LABELS, event.from), label(ROLE_LABELS, event.to));
    case "AccountStatusChanged":
      return pair(label(STATUS_LABELS as Record<AccountStatus, string>, event.from), label(STATUS_LABELS as Record<AccountStatus, string>, event.to));
    case "DepartureStatusChanged": {
      const change = pair(label(DEPARTURE_STATUS_LABELS, event.from), label(DEPARTURE_STATUS_LABELS, event.to));
      if (event.source !== "cron") return change;
      const reason = event.reason === "sold_out" ? "hết ghế" : "tới hạn chốt bán";
      return { ...change, summary: `${change.summary} (tự động: ${reason})` };
    }
    case "VehicleStatusChanged":
      return pair(label(VEHICLE_STATUS_LABELS, event.from), label(VEHICLE_STATUS_LABELS, event.to));
    case "DepartureOwnerChanged":
      return pair(event.from == null ? "Chưa có" : `Người dùng #${asString(event.from)}`, `Người dùng #${asString(event.to)}`);
    case "TripPriceChanged":
      return pair(formatVnd(asString(event.from)), formatVnd(asString(event.to)));
    case "TripAvailabilityChanged":
      return pair(event.from ? "Đang mở bán" : "Ngừng bán", event.to ? "Đang mở bán" : "Ngừng bán");
    case "TripCreated":
      return { after: formatVnd(asString(event.base_price)), summary: `Giá gốc ${formatVnd(asString(event.base_price))}` };
    case "MoneyRecorded":
      return { after: formatVnd(asString(event.amount)), summary: formatVnd(asString(event.amount)) };
    case "SupplyReceived":
      return { after: `+${formatCount(Number(event.quantity ?? 0))}`, summary: `+${formatCount(Number(event.quantity ?? 0))} · Vật tư #${asString(event.item_id)}` };
    case "SupplyIssued":
      return { after: `-${formatCount(Number(event.quantity ?? 0))}`,
        summary: `-${formatCount(Number(event.quantity ?? 0))} · Vật tư #${asString(event.item_id)} → Chuyến #${asString(event.departure_id)}` };
    case "SupplyReturned":
      return { after: `+${formatCount(Number(event.quantity ?? 0))}`,
        summary: `+${formatCount(Number(event.quantity ?? 0))} · Vật tư #${asString(event.item_id)} từ Chuyến #${asString(event.departure_id)}` };
    default:
      return { summary: "Không có giá trị thay đổi" };
  }
}

export type AuditRange = "1d" | "7d" | "30d" | "all";
export const AUDIT_RANGES: readonly { value: AuditRange; label: string; days: number | null }[] = [
  { value: "1d", label: "24 giờ qua", days: 1 }, { value: "7d", label: "7 ngày gần nhất", days: 7 },
  { value: "30d", label: "30 ngày gần nhất", days: 30 }, { value: "all", label: "Toàn bộ", days: null },
];

export type AuditQuery = {
  page: number; pageSize: number; recordId?: string; userId?: number; action?: AuditAction; table?: AuditTable; range: AuditRange;
};

// The API rejects empty or unknown parameters (strict schema), so only send what is set.
export function auditSearchParams(query: AuditQuery, now: Date): URLSearchParams {
  const params = new URLSearchParams({ page: String(Math.max(1, Math.trunc(query.page) || 1)), pageSize: String(query.pageSize) });
  const record = query.recordId?.trim().replace(/^#/, "");
  if (record && /^[A-Za-z0-9_]{1,40}$/.test(record)) params.set("record_id", record);
  if (query.userId !== undefined) params.set("user_id", String(query.userId));
  if (query.action) params.set("action", query.action);
  if (query.table) params.set("table_name", query.table);
  const days = AUDIT_RANGES.find((range) => range.value === query.range)?.days;
  if (days) params.set("from", new Date(now.getTime() - days * 86_400_000).toISOString());
  return params;
}
export function validRecordId(value: string): boolean {
  const record = value.trim().replace(/^#/, "");
  return record === "" || /^[A-Za-z0-9_]{1,40}$/.test(record);
}

export type AuditPage = { items: AuditItem[]; pagination: Page<unknown>["pagination"] };
export type StaffAccount = { user_id: number; full_name: string; role: Role };

export const auditClient = {
  list: (query: AuditQuery, now: Date, signal?: AbortSignal) => request<AuditPage>(`/api/admin/audit?${auditSearchParams(query, now)}`, signal),
  // Staff who can write audit events (the actor filter). Customers never act on audited records.
  staff: async (signal?: AbortSignal) => {
    const pages = await Promise.all((["Admin", "RouteMgr", "HRMgr", "Leader"] as const).map((role) =>
      request<Page<StaffAccount>>(`/api/admin/users?page=1&pageSize=50&role=${role}`, signal)));
    return pages.flatMap((page) => page.items).sort((a, b) => a.full_name.localeCompare(b.full_name, "vi"));
  },
  count: async (query: Omit<AuditQuery, "page" | "pageSize">, now: Date, signal?: AbortSignal) =>
    (await request<AuditPage>(`/api/admin/audit?${auditSearchParams({ ...query, page: 1, pageSize: 1 }, now)}`, signal)).pagination.totalItems,
};
