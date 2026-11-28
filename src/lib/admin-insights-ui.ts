// Q04 admin screens: dashboard, audit log and system settings.
// Only system settings are readable from the server today (readAdminPortal); there is no revenue report,
// audit-log list or settings-update API yet, so the dashboard and audit log run on demo data shaped like
// the real records (PRD 7.3 revenue rule, src/server/audit.ts allowlist) and saving settings is local only.

import type { Role } from "@/schemas/auth";
import { ROLE_LABELS, STATUS_LABELS, formatCount, formatVnd, type AccountStatus, type Tone } from "@/lib/customer-account-ui";

// ---------- Shared labels ----------

export const DEPARTURE_STATUS_LABELS = {
  Draft: "Nháp", Open: "Đang mở bán", Closed: "Đã chốt bán", Confirmed: "Đã xác nhận",
  Running: "Đang chạy", Ended: "Đã kết thúc", Cancelled: "Đã hủy", Rescheduled: "Đã dời lịch",
} as const;
export type DepartureStatus = keyof typeof DEPARTURE_STATUS_LABELS;
export const DEPARTURE_STATUS_TONE: Record<DepartureStatus, Tone> = {
  Draft: "neutral", Open: "warning", Closed: "warning", Confirmed: "success",
  Running: "success", Ended: "neutral", Cancelled: "danger", Rescheduled: "neutral",
};
export const VEHICLE_STATUS_LABELS = { Ready: "Sẵn sàng", Maintenance: "Đang bảo dưỡng", Inactive: "Ngừng hoạt động" } as const;

// ---------- System settings (SYSTEM_SETTINGS, PRD 15.7 #3) ----------

export type SettingKey = "SEAT_TTL_MINUTES" | "MAX_SEATS_PER_INVOICE" | "LEADER_RATIO";
export type SettingField = { key: SettingKey; label: string; unit: string; min: number; max: number; fallback: number; help: string };

// Ranges are UI proposals; PRD only fixes the defaults (15 / 10 / 15). Confirm them when the update API lands.
export const SETTING_FIELDS: readonly SettingField[] = [
  { key: "SEAT_TTL_MINUTES", label: "Thời gian giữ ghế", unit: "phút", min: 5, max: 60, fallback: 15,
    help: "Hóa đơn chưa thanh toán sau thời gian này sẽ hết hạn và ghế được nhả lại." },
  { key: "MAX_SEATS_PER_INVOICE", label: "Số ghế tối đa mỗi hóa đơn", unit: "ghế", min: 1, max: 20, fallback: 10,
    help: "Giới hạn số ghế khách chọn trong một lần đặt." },
  { key: "LEADER_RATIO", label: "Số khách cho mỗi Leader", unit: "khách", min: 5, max: 30, fallback: 15,
    help: "Số Leader tối thiểu của chuyến = số vé hợp lệ chia cho giá trị này, làm tròn lên." },
];

export type SettingValues = Record<SettingKey, string>;
export type SettingRow = { setting_key: string; setting_value: string; description?: string | null };

export function settingValuesFrom(rows: readonly SettingRow[]): SettingValues {
  const byKey = new Map(rows.map((row) => [row.setting_key, row.setting_value.trim()]));
  return Object.fromEntries(SETTING_FIELDS.map((field) => [field.key, byKey.get(field.key) ?? String(field.fallback)])) as SettingValues;
}

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

// ---------- Audit log (AUDIT_LOGS + allowlisted events in src/server/audit.ts) ----------

export const AUDIT_ACTION_LABELS = {
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
} as const;
export type AuditAction = keyof typeof AUDIT_ACTION_LABELS;
export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];

export const AUDIT_OBJECT_LABELS = {
  users: "Tài khoản", departures: "Chuyến", trips: "Tuyến", vehicles: "Xe", payments: "Thanh toán",
  refunds: "Hoàn tiền", departure_costs: "Chi phí chuyến", vehicle_maintenance: "Bảo dưỡng xe",
  supply_items: "Vật tư", supply_transactions: "Phiếu nhập",
} as const;
export type AuditTable = keyof typeof AUDIT_OBJECT_LABELS;
// Filter groups shown in the UI; legacy money tables are folded into "Thanh toán".
export const AUDIT_OBJECT_FILTERS = [
  { value: "users", label: "Tài khoản", tables: ["users"] },
  { value: "departures", label: "Chuyến", tables: ["departures"] },
  { value: "trips", label: "Tuyến", tables: ["trips"] },
  { value: "vehicles", label: "Xe", tables: ["vehicles", "vehicle_maintenance"] },
  { value: "payments", label: "Thanh toán", tables: ["payments", "refunds", "departure_costs"] },
  { value: "supplies", label: "Vật tư", tables: ["supply_items", "supply_transactions"] },
] as const satisfies readonly { value: string; label: string; tables: readonly AuditTable[] }[];
export type AuditObjectFilter = (typeof AUDIT_OBJECT_FILTERS)[number]["value"];

export type AuditActor = { user_id: number; full_name: string; role: Role };
// `detail` is the parsed `description` JSON (the allowlisted event without free text).
export type AuditEntry = {
  log_id: number; created_at: string; actor: AuditActor; action: AuditAction;
  table_name: AuditTable; record_id: string; detail: Record<string, unknown>;
};

export function auditObjectLabel(entry: Pick<AuditEntry, "table_name" | "record_id">): string {
  return `${AUDIT_OBJECT_LABELS[entry.table_name]} #${entry.record_id}`;
}

const asString = (value: unknown) => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value));
function label<T extends Record<string, string>>(map: T, value: unknown): string {
  const key = asString(value);
  return key in map ? map[key as keyof T] : key;
}

export type AuditChange = { before?: string; after?: string; summary: string };

export function describeAuditChange(entry: Pick<AuditEntry, "action" | "detail">): AuditChange {
  const { detail } = entry;
  const pair = (before: string, after: string): AuditChange => ({ before, after, summary: `${before} → ${after}` });
  switch (entry.action) {
    case "RoleChanged":
      return pair(label(ROLE_LABELS, detail.from), label(ROLE_LABELS, detail.to));
    case "AccountStatusChanged":
      return pair(label(STATUS_LABELS as Record<AccountStatus, string>, detail.from), label(STATUS_LABELS as Record<AccountStatus, string>, detail.to));
    case "DepartureStatusChanged":
      return pair(label(DEPARTURE_STATUS_LABELS, detail.from), label(DEPARTURE_STATUS_LABELS, detail.to));
    case "VehicleStatusChanged":
      return pair(label(VEHICLE_STATUS_LABELS, detail.from), label(VEHICLE_STATUS_LABELS, detail.to));
    case "DepartureOwnerChanged":
      return pair(detail.from == null ? "Chưa có" : `Người dùng #${asString(detail.from)}`, `Người dùng #${asString(detail.to)}`);
    case "TripPriceChanged":
      return pair(formatVnd(asString(detail.from)), formatVnd(asString(detail.to)));
    case "TripAvailabilityChanged":
      return pair(detail.from ? "Đang mở bán" : "Ngừng bán", detail.to ? "Đang mở bán" : "Ngừng bán");
    case "TripCreated":
      return { after: formatVnd(asString(detail.base_price)), summary: `Giá gốc ${formatVnd(asString(detail.base_price))}` };
    case "MoneyRecorded":
      return { after: formatVnd(asString(detail.amount)), summary: formatVnd(asString(detail.amount)) };
    case "SupplyReceived":
      return { after: `+${formatCount(Number(detail.quantity ?? 0))}`, summary: `+${formatCount(Number(detail.quantity ?? 0))} · Vật tư #${asString(detail.item_id)}` };
    default:
      return { summary: "Không có giá trị thay đổi" };
  }
}

export type AuditRange = "1d" | "7d" | "30d";
export const AUDIT_RANGES: readonly { value: AuditRange; label: string; days: number }[] = [
  { value: "1d", label: "24 giờ qua", days: 1 }, { value: "7d", label: "7 ngày gần nhất", days: 7 },
  { value: "30d", label: "30 ngày gần nhất", days: 30 },
];

export type AuditQuery = {
  page: number; pageSize: number; q?: string; actorId?: number; action?: AuditAction;
  object?: AuditObjectFilter; range: AuditRange;
};
export type AuditPage = { items: AuditEntry[]; page: number; pageSize: number; totalItems: number; totalPages: number };

export function filterAudit(entries: readonly AuditEntry[], query: AuditQuery, now: Date): AuditPage {
  const days = AUDIT_RANGES.find((range) => range.value === query.range)?.days ?? 7;
  const since = now.getTime() - days * 86_400_000;
  const term = query.q?.trim().replace(/^#/, "").toLowerCase();
  const tables = query.object ? AUDIT_OBJECT_FILTERS.find((group) => group.value === query.object)?.tables : undefined;
  const matched = entries
    .filter((entry) => new Date(entry.created_at).getTime() >= since && new Date(entry.created_at).getTime() <= now.getTime())
    .filter((entry) => query.actorId === undefined || entry.actor.user_id === query.actorId)
    .filter((entry) => !query.action || entry.action === query.action)
    .filter((entry) => !tables || (tables as readonly string[]).includes(entry.table_name))
    .filter((entry) => !term || String(entry.log_id) === term || entry.record_id.toLowerCase() === term)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.log_id - a.log_id);
  const totalPages = Math.max(1, Math.ceil(matched.length / query.pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);
  return { items: matched.slice((page - 1) * query.pageSize, page * query.pageSize), page, pageSize: query.pageSize, totalItems: matched.length, totalPages };
}

export function auditSummary(entries: readonly AuditEntry[], now: Date) {
  const since = now.getTime() - 7 * 86_400_000;
  const recent = entries.filter((entry) => {
    const time = new Date(entry.created_at).getTime();
    return time >= since && time <= now.getTime();
  });
  return {
    total: recent.length,
    accountChanges: recent.filter((entry) => entry.action === "RoleChanged" || entry.action === "AccountStatusChanged").length,
    moneyAndPrice: recent.filter((entry) => entry.action === "MoneyRecorded" || entry.action === "TripPriceChanged").length,
  };
}

export function auditActors(entries: readonly AuditEntry[]): AuditActor[] {
  const byId = new Map(entries.map((entry) => [entry.actor.user_id, entry.actor]));
  return [...byId.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, "vi"));
}

// Fixed reference time so demo data and the "last 7 days" window stay stable between renders.
export const DEMO_NOW = new Date("2026-10-30T10:00:00.000Z");

const AN: AuditActor = { user_id: 3, full_name: "Nguyễn Văn An", role: "Admin" };
const QUAN: AuditActor = { user_id: 12, full_name: "Trần Minh Quân", role: "RouteMgr" };
const OANH: AuditActor = { user_id: 18, full_name: "Lê Thị Kim Oanh", role: "HRMgr" };
const HOANG: AuditActor = { user_id: 21, full_name: "Lê Văn Hoàng", role: "Leader" };

function demoEntry(log_id: number, created_at: string, actor: AuditActor, action: AuditAction, table_name: AuditTable,
  record_id: number, detail: Record<string, unknown> = {}): AuditEntry {
  return { log_id, created_at, actor, action, table_name, record_id: String(record_id), detail: { action, record_id, ...detail } };
}

export const DEMO_AUDIT: readonly AuditEntry[] = [
  demoEntry(88410, "2026-10-30T07:35:12.000Z", AN, "RoleChanged", "users", 42, { from: "Customer", to: "RouteMgr" }),
  demoEntry(88409, "2026-10-30T04:20:05.000Z", AN, "AccountStatusChanged", "users", 57, { from: "Active", to: "Locked" }),
  demoEntry(88401, "2026-10-29T09:45:22.000Z", QUAN, "DepartureStatusChanged", "departures", 128, { from: "Closed", to: "Confirmed" }),
  demoEntry(88398, "2026-10-29T02:12:00.000Z", QUAN, "TripPriceChanged", "trips", 12, { from: "1590000", to: "1690000" }),
  demoEntry(88390, "2026-10-28T10:30:41.000Z", OANH, "SupplyReceived", "supply_transactions", 305, { item_id: 18, quantity: 20 }),
  demoEntry(88388, "2026-10-28T03:05:10.000Z", AN, "MoneyRecorded", "payments", 981, { table_name: "payments", amount: "3180000" }),
  demoEntry(88380, "2026-10-27T08:15:00.000Z", OANH, "LeaderAccountCreated", "users", 64),
  demoEntry(88377, "2026-10-27T01:40:33.000Z", OANH, "VehicleStatusChanged", "vehicles", 7, { from: "Ready", to: "Maintenance" }),
  demoEntry(88371, "2026-10-26T11:02:19.000Z", AN, "DepartureOwnerChanged", "departures", 131, { from: 12, to: 15 }),
  demoEntry(88366, "2026-10-26T06:48:00.000Z", HOANG, "DepartureStatusChanged", "departures", 119, { from: "Running", to: "Ended" }),
  demoEntry(88360, "2026-10-25T09:10:45.000Z", QUAN, "TripAvailabilityChanged", "trips", 9, { from: true, to: false }),
  demoEntry(88352, "2026-10-25T02:30:00.000Z", QUAN, "TripCreated", "trips", 15, { base_price: "2450000" }),
  demoEntry(88341, "2026-10-24T04:00:12.000Z", OANH, "SupplyItemCreated", "supply_items", 22),
  demoEntry(88330, "2026-10-23T08:25:40.000Z", AN, "AccountStatusChanged", "users", 33, { from: "Locked", to: "Active" }),
  demoEntry(88301, "2026-10-21T03:15:00.000Z", OANH, "SupplyItemUpdated", "supply_items", 18),
  demoEntry(88250, "2026-10-12T07:00:00.000Z", AN, "RoleChanged", "users", 29, { from: "HRMgr", to: "Admin" }),
];

// ---------- Dashboard (revenue = SUM(total_amount) of Paid invoices, PRD 7.3) ----------

export type DashboardPeriod = "today" | "7d" | "30d" | "month";
export const DASHBOARD_PERIODS: readonly { value: DashboardPeriod; label: string; days: number }[] = [
  { value: "today", label: "Hôm nay", days: 1 }, { value: "7d", label: "7 ngày gần nhất", days: 7 },
  { value: "30d", label: "30 ngày gần nhất", days: 30 }, { value: "month", label: "Tháng này", days: 30 },
];

export type DailyRevenue = { date: string; amount: number };
export type RouteRevenue = { route: string; amount: number; departures: number };
export type RecentDeparture = {
  departure_id: number; route: string; departure_date: string; leader: string | null;
  sold: number; seats: number; revenue: number; status: DepartureStatus;
};
export type DashboardData = {
  period: DashboardPeriod; from: string; to: string; daily: DailyRevenue[];
  revenue: number; previousRevenue: number; ticketsSold: number; seatsOffered: number;
  departures: { total: number; ended: number; running: number; confirmed: number };
  routes: RouteRevenue[]; otherRoutes: RouteRevenue | null; recent: RecentDeparture[];
  alerts: { paymentsNeedingReview: number; overdueOpenDepartures: number };
};

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

export function formatMoney(value: number): string {
  return formatVnd(String(Math.round(value)));
}

// Short axis label: 30.400.000 → "30,4tr".
export function formatMillions(value: number): string {
  return `${(Math.round(value / 100_000) / 10).toLocaleString("vi-VN")}tr`;
}

// Splits `total` by weights so the parts always add up exactly (largest remainder).
export function splitByWeights(total: number, weights: readonly number[]): number[] {
  const weightSum = sum(weights);
  if (weightSum <= 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (total * weight) / weightSum);
  const floors = raw.map(Math.floor);
  let remainder = total - sum(floors);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] += 1;
    remainder -= 1;
  }
  return floors;
}

const DEMO_DAILY_MILLIONS = [30.4, 33.6, 36, 28, 38.4, 46.4, 57.6, 32, 35.2, 41.6, 40, 37.6, 48, 60.8, 36.8, 41.6, 44, 46.4,
  51.2, 54.4, 67.2, 44, 47.2, 49.6, 52.8, 56, 60, 73.6, 52, 64];
const DEMO_ROUTES = [
  { route: "Tà Năng – Phan Dũng", weight: 36.4, departures: 16 }, { route: "Bidoup – Núi Bà", weight: 25.9, departures: 12 },
  { route: "Chứa Chan 1N", weight: 16.2, departures: 10 }, { route: "Núi Dinh 1N", weight: 12.1, departures: 6 },
  { route: "Lảo Thẩn – Y Tý", weight: 5.4, departures: 2 }, { route: "Langbiang 1N", weight: 4, departures: 2 },
];
const DEMO_RECENT: RecentDeparture[] = [
  { departure_id: 131, route: "Tà Năng – Phan Dũng 3N2Đ", departure_date: "2026-11-06T22:00:00.000Z", leader: "Vũ Long", sold: 18, seats: 20, revenue: 57_600_000, status: "Closed" },
  { departure_id: 129, route: "Săn mây Lảo Thẩn", departure_date: "2026-11-01T23:00:00.000Z", leader: "Đặng Tuấn", sold: 18, seats: 20, revenue: 48_600_000, status: "Confirmed" },
  { departure_id: 128, route: "Bidoup – Núi Bà 2N1Đ", departure_date: "2026-10-29T22:30:00.000Z", leader: "Trương Minh", sold: 19, seats: 20, revenue: 57_000_000, status: "Running" },
  { departure_id: 126, route: "Tà Năng – Phan Dũng 3N2Đ", departure_date: "2026-10-27T22:00:00.000Z", leader: "Hoàng Nam", sold: 20, seats: 20, revenue: 64_000_000, status: "Ended" },
  { departure_id: 124, route: "Chinh phục Chứa Chan", departure_date: "2026-10-24T23:00:00.000Z", leader: null, sold: 25, seats: 25, revenue: 30_800_000, status: "Ended" },
];

export function demoDashboard(period: DashboardPeriod, now: Date = DEMO_NOW): DashboardData {
  const days = DASHBOARD_PERIODS.find((item) => item.value === period)?.days ?? 30;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daily = DEMO_DAILY_MILLIONS.slice(-days).map((millions, index, list) => ({
    date: new Date(end.getTime() - (list.length - 1 - index) * 86_400_000).toISOString(),
    amount: Math.round(millions * 1_000_000),
  }));
  const revenue = sum(daily.map((day) => day.amount));
  const routeAmounts = splitByWeights(revenue, DEMO_ROUTES.map((route) => route.weight));
  const scale = days / 30;
  const routes = DEMO_ROUTES.map((route, index) => ({
    route: route.route, amount: routeAmounts[index], departures: Math.max(1, Math.round(route.departures * scale)),
  }));
  const top = routes.slice(0, 4);
  const rest = routes.slice(4);
  const departuresTotal = sum(routes.map((route) => route.departures));
  const running = Math.min(8, departuresTotal);
  const confirmed = Math.min(2, departuresTotal - running);
  return {
    period, from: daily[0].date, to: daily[daily.length - 1].date, daily, revenue,
    previousRevenue: Math.round(revenue / 1.142), ticketsSold: Math.round(revenue / 1_764_000),
    seatsOffered: Math.round(revenue / 1_764_000 / 0.914),
    departures: { total: departuresTotal, ended: departuresTotal - running - confirmed, running, confirmed },
    routes: top,
    otherRoutes: rest.length ? { route: "Các tuyến khác", amount: sum(rest.map((route) => route.amount)), departures: sum(rest.map((route) => route.departures)) } : null,
    recent: DEMO_RECENT,
    alerts: { paymentsNeedingReview: 3, overdueOpenDepartures: 2 },
  };
}
