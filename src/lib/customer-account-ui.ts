// C04: customer directory (C03 API) and account access management (A01 API) — presentation rules,
// labels, the browser client and the demo account source. No React or server imports, so it is unit-tested.
import type { Page } from "@/schemas/catalog";
import type { CustomerBookingDto, CustomerDetailDto, CustomerSummaryDto } from "@/schemas/customer";
import type { Role } from "@/schemas/auth";

export const ROLES: readonly Role[] = ["Customer", "Leader", "RouteMgr", "HRMgr", "Admin"];
export type AccountStatus = "Active" | "Locked";
export const PAGE_SIZES = [10, 20, 50] as const; // pageQuerySchema caps pageSize at 50.

// ---------- Labels ----------

export const ROLE_LABELS: Record<Role, string> = {
  Customer: "Khách hàng",
  Leader: "Leader",
  RouteMgr: "Quản lý tuyến",
  HRMgr: "Quản lý nhân sự",
  Admin: "Quản trị viên",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Customer: "Đặt vé và xem vé của mình",
  Leader: "Dẫn đoàn, xem danh sách khách và check-in",
  RouteMgr: "Quản lý tuyến, chuyến và hóa đơn phụ trách",
  HRMgr: "Quản lý nhân sự, xe và phân công",
  Admin: "Toàn quyền quản trị và đối soát",
};

export function roleLabel(role: string | null | undefined): string {
  return role && role in ROLE_LABELS ? ROLE_LABELS[role as Role] : role ?? "";
}

export const STATUS_LABELS: Record<AccountStatus, string> = { Active: "Đang hoạt động", Locked: "Đã khóa" };

export const INVOICE_STATUS_LABELS: Record<CustomerBookingDto["status"], string> = {
  Paid: "Đã thanh toán",
  Pending: "Chờ thanh toán",
  Expired: "Hết hạn",
  Cancelled: "Đã hủy",
};

type TicketDto = CustomerBookingDto["tickets"][number];
export const TICKET_STATUS_LABELS: Record<TicketDto["status"], string> = { Valid: "Hợp lệ", Pending: "Chờ", Cancelled: "Đã hủy" };
export const CHECK_IN_LABELS: Record<TicketDto["check_in_status"], string> = {
  Pending: "Chưa check-in",
  CheckedIn: "Đã check-in",
  Absent: "Vắng",
};

export type Tone = "success" | "warning" | "neutral" | "danger";
export const INVOICE_STATUS_TONE: Record<CustomerBookingDto["status"], Tone> = {
  Paid: "success", Pending: "warning", Expired: "neutral", Cancelled: "danger",
};

// "Ghế A1 · Nguyễn Văn An · Hợp lệ · Đã check-in"; check-in only matters for a valid ticket.
export function describeTicket(ticket: TicketDto): string {
  const parts = [`Ghế ${ticket.seat_name}`, ticket.passenger_name, TICKET_STATUS_LABELS[ticket.status]];
  if (ticket.status === "Valid") parts.push(CHECK_IN_LABELS[ticket.check_in_status]);
  return parts.join(" · ");
}

export function describeResponsible(booking: Pick<CustomerBookingDto, "responsible_name_snapshot" | "responsible_role_snapshot">): string | null {
  if (!booking.responsible_name_snapshot) return null;
  const role = booking.responsible_role_snapshot ? roleLabel(booking.responsible_role_snapshot) : "";
  return role ? `${booking.responsible_name_snapshot} · ${role}` : booking.responsible_name_snapshot;
}

export function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const pick = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return pick.map((word) => word[0]).join("").toUpperCase();
}

// ---------- Formatting (Vietnam time, VND) ----------

const timeZone = "Asia/Ho_Chi_Minh";
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat("vi-VN", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${time}, ${formatDate(iso)}`;
}
// Amounts arrive as integer strings (Decimal on the server); never parse them into floats for math.
export function formatVnd(amount: string): string {
  const digits = amount.replace(/[^\d-]/g, "");
  if (!digits) return amount;
  const negative = digits.startsWith("-");
  const grouped = digits.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped} ₫`;
}
export function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// ---------- Capabilities (UI mirror of PRD 3.2/3.3; the server re-checks everything) ----------

export type DirectoryCapabilities = {
  canReadCustomers: boolean; // Admin (all) and RouteMgr (own invoices)
  canManageAccounts: boolean; // Admin only
  customerScope: "all" | "responsible" | "none";
};

export function directoryCapabilities(role: string | null | undefined): DirectoryCapabilities {
  if (role === "Admin") return { canReadCustomers: true, canManageAccounts: true, customerScope: "all" };
  if (role === "RouteMgr") return { canReadCustomers: true, canManageAccounts: false, customerScope: "responsible" };
  return { canReadCustomers: false, canManageAccounts: false, customerScope: "none" };
}

export type AccountRow = {
  user_id: number;
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  status: AccountStatus;
  created_at: string;
  // A Leader account is tied 1:1 to a STAFF profile (PRD 3.3); the server rejects role changes that break it.
  has_staff_profile: boolean;
};

export type AccountActionState = {
  isSelf: boolean;
  canChangeRole: boolean;
  roleChangeHint: string | null;
  canToggleLock: boolean;
};

// Nobody edits their own access (no self-escalation, no self-lockout). A STAFF-linked account must stay Leader.
export function accountActions(account: Pick<AccountRow, "user_id" | "has_staff_profile">, actorUserId: number | null): AccountActionState {
  const isSelf = actorUserId !== null && account.user_id === actorUserId;
  if (isSelf) return { isSelf, canChangeRole: false, roleChangeHint: "Không thể tự thay đổi tài khoản của bạn", canToggleLock: false };
  if (account.has_staff_profile) return { isSelf, canChangeRole: false, roleChangeHint: "Gắn với hồ sơ nhân sự", canToggleLock: true };
  return { isSelf, canChangeRole: true, roleChangeHint: null, canToggleLock: true };
}

export type RoleOption = { role: Role; label: string; description: string; disabled: boolean; current: boolean };

export function roleOptions(account: Pick<AccountRow, "role" | "has_staff_profile">): RoleOption[] {
  return ROLES.map((role) => {
    const leaderBlocked = role === "Leader" && !account.has_staff_profile;
    return {
      role,
      label: ROLE_LABELS[role],
      description: leaderBlocked ? "Chỉ dành cho tài khoản có hồ sơ nhân sự Leader" : ROLE_DESCRIPTIONS[role],
      disabled: leaderBlocked,
      current: role === account.role,
    };
  });
}

// ---------- Errors ----------

export class AccountClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export type Failure = { title: string; detail?: string; retryable: boolean; signIn?: boolean };

export function describeFailure(code: string, status: number, action: "read" | "role" | "lock" | "unlock" = "read"): Failure {
  if (code === "UNAUTHENTICATED" || status === 401) return { title: "Phiên đăng nhập đã hết", detail: "Vui lòng đăng nhập lại.", retryable: false, signIn: true };
  if (code === "FORBIDDEN" || status === 403) return { title: "Bạn không có quyền thực hiện thao tác này", retryable: false };
  if (code === "NOT_FOUND" || status === 404) return { title: "Không tìm thấy tài khoản", detail: "Tài khoản có thể đã thay đổi. Tải lại để xem dữ liệu mới.", retryable: true };
  if (code === "LAST_ADMIN") {
    return { title: action === "lock" ? "Không thể khóa tài khoản" : "Không thể đổi vai trò",
      detail: "Phải còn ít nhất một quản trị viên đang hoạt động.", retryable: false };
  }
  if (code === "STAFF_LINK") {
    return { title: "Không thể đổi vai trò", detail: "Vai trò Leader phải gắn với hồ sơ nhân sự Leader.", retryable: false };
  }
  if (code === "ACCESS_CONFLICT" || status === 409) {
    return { title: action === "role" ? "Không thể đổi vai trò" : "Không thể cập nhật tài khoản",
      detail: "Phải còn ít nhất một quản trị viên đang hoạt động, và vai trò Leader phải gắn với hồ sơ nhân sự.", retryable: false };
  }
  if (code === "INVALID_INPUT" || status === 422) return { title: "Dữ liệu không hợp lệ", detail: "Kiểm tra lại lựa chọn rồi thử lại.", retryable: false };
  if (code === "RATE_LIMITED" || status === 429) return { title: "Thao tác quá nhanh", detail: "Vui lòng chờ vài giây rồi thử lại.", retryable: true };
  if (code === "NETWORK_ERROR") return { title: "Mất kết nối", detail: "Kiểm tra mạng rồi thử lại.", retryable: true };
  return { title: "Không tải được dữ liệu", detail: "Hệ thống đang bận. Vui lòng thử lại.", retryable: true };
}

// ---------- Browser client (C03 customers, A01 access) ----------

async function request<T>(url: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "PATCH",
      headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new AccountClientError(0, "NETWORK_ERROR", "Mất kết nối.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AccountClientError(response.status, payload?.error?.code ?? "REQUEST_FAILED", payload?.error?.message ?? "Không thực hiện được.");
  }
  if (!payload || payload.data === undefined) throw new AccountClientError(502, "INVALID_RESPONSE", "Dữ liệu chưa sẵn sàng.");
  return payload.data as T;
}

export type CustomerQuery = { page: number; pageSize: number; q?: string; status?: AccountStatus };

// The API rejects empty or unknown parameters (strict schema), so only send what is set.
export function customerSearchParams(query: CustomerQuery): URLSearchParams {
  const params = new URLSearchParams({ page: String(Math.max(1, Math.trunc(query.page) || 1)), pageSize: String(query.pageSize) });
  const q = query.q?.trim();
  if (q) params.set("q", q.slice(0, 100));
  if (query.status) params.set("status", query.status);
  return params;
}

export type AccessPatch = { role?: Role; status?: AccountStatus };
export type AccessResult = { user_id: number; email: string; full_name: string; phone: string; role: Role; status: AccountStatus };

export const customerClient = {
  list: (query: CustomerQuery, signal?: AbortSignal) =>
    request<Page<CustomerSummaryDto>>(`/api/staff/customers?${customerSearchParams(query)}`, signal),
  detail: (customerId: number, signal?: AbortSignal) => request<CustomerDetailDto>(`/api/staff/customers/${customerId}`, signal),
};

// A01: PATCH /api/admin/users/:id/access takes exactly { role?, status? } (strict schema; no reason field).
export function updateAccountAccess(userId: number, patch: AccessPatch, signal?: AbortSignal): Promise<AccessResult> {
  if (patch.role === undefined && patch.status === undefined) throw new AccountClientError(422, "INVALID_INPUT", "Thiếu thay đổi.");
  return request<AccessResult>(`/api/admin/users/${userId}/access`, signal, patch);
}

// ---------- Account directory source ----------

export type AccountQuery = { page: number; pageSize: number; q?: string; role?: Role; status?: AccountStatus };
export type AccountPage = Page<AccountRow> & { roleCounts: Record<Role, number> };

export type AccountSource = {
  readonly isDemo: boolean;
  list(query: AccountQuery, signal?: AbortSignal): Promise<AccountPage>;
  updateAccess(userId: number, patch: AccessPatch): Promise<AccountRow>;
};

function foldVietnamese(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

export function filterAccounts(rows: readonly AccountRow[], query: AccountQuery): AccountPage {
  const q = foldVietnamese(query.q?.trim() ?? "");
  const roleCounts = Object.fromEntries(ROLES.map((role) => [role, rows.filter((row) => row.role === role).length])) as Record<Role, number>;
  const matched = rows.filter((row) => (!query.role || row.role === query.role) && (!query.status || row.status === query.status)
    && (!q || foldVietnamese(`${row.full_name} ${row.email}`).includes(q)));
  const totalPages = Math.max(1, Math.ceil(matched.length / query.pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const items = matched.slice((page - 1) * query.pageSize, page * query.pageSize);
  return { items, roleCounts, pagination: { page, pageSize: query.pageSize, totalItems: matched.length, totalPages } };
}

// Same conflict rules as accountsService.updateAccountAccess, so the demo behaves like the real API.
export function applyAccessPatch(rows: readonly AccountRow[], userId: number, patch: AccessPatch): { rows: AccountRow[]; updated: AccountRow } {
  const current = rows.find((row) => row.user_id === userId);
  if (!current) throw new AccountClientError(404, "NOT_FOUND", "Không tìm thấy tài khoản.");
  const role = patch.role ?? current.role;
  const status = patch.status ?? current.status;
  if ((role === "Leader") !== current.has_staff_profile) throw new AccountClientError(409, "STAFF_LINK", "Vai trò Leader phải gắn với hồ sơ nhân sự.");
  const activeAdmins = rows.filter((row) => row.role === "Admin" && row.status === "Active").length;
  if (current.role === "Admin" && current.status === "Active" && (role !== "Admin" || status !== "Active") && activeAdmins <= 1) {
    throw new AccountClientError(409, "LAST_ADMIN", "Phải còn ít nhất một quản trị viên đang hoạt động.");
  }
  const updated = { ...current, role, status };
  return { rows: rows.map((row) => (row.user_id === userId ? updated : row)), updated };
}

// Demo data for the account directory until an admin account-list API exists (C04: "dữ liệu giả cho demo").
// Mutations stay in memory on purpose: demo ids could collide with real users, so they never reach the A01 API.
export const DEMO_ACCOUNTS: readonly AccountRow[] = [
  { user_id: 9001, full_name: "Trần Bảo Long", email: "long.tran@gotrail.vn", phone: "0901000001", role: "Admin", status: "Active", created_at: "2026-01-01T02:00:00.000Z", has_staff_profile: false },
  { user_id: 9002, full_name: "Nguyễn Thị Kim Oanh", email: "oanh.nguyen@gotrail.vn", phone: "0901000002", role: "HRMgr", status: "Active", created_at: "2026-01-15T02:00:00.000Z", has_staff_profile: false },
  { user_id: 9003, full_name: "Vũ Đình Trọng", email: "trong.vu@gotrail.vn", phone: "0901000003", role: "RouteMgr", status: "Active", created_at: "2026-01-20T02:00:00.000Z", has_staff_profile: false },
  { user_id: 9004, full_name: "Lê Thị Mai", email: "mai.le@gotrail.vn", phone: "0901000004", role: "RouteMgr", status: "Active", created_at: "2026-01-22T02:00:00.000Z", has_staff_profile: false },
  { user_id: 9005, full_name: "Lê Văn Hoàng", email: "hoang.le@gotrail.vn", phone: "0905112233", role: "Leader", status: "Active", created_at: "2026-02-02T02:00:00.000Z", has_staff_profile: true },
  { user_id: 9006, full_name: "Đỗ Mạnh Dũng", email: "dung.do@gotrail.vn", phone: "0905112244", role: "Leader", status: "Locked", created_at: "2026-02-10T02:00:00.000Z", has_staff_profile: true },
  { user_id: 9007, full_name: "Phan Quốc Huy", email: "huy.phan@gotrail.vn", phone: "0905112255", role: "Leader", status: "Active", created_at: "2026-02-18T02:00:00.000Z", has_staff_profile: true },
  { user_id: 9008, full_name: "Phạm Mai Phương", email: "phuong.pham@gmail.com", phone: "0912345001", role: "Customer", status: "Active", created_at: "2026-03-05T02:00:00.000Z", has_staff_profile: false },
  { user_id: 9009, full_name: "Hoàng Nhật Minh", email: "minh.hoang@gmail.com", phone: "0909554433", role: "Customer", status: "Locked", created_at: "2026-03-12T02:00:00.000Z", has_staff_profile: false },
  { user_id: 9010, full_name: "Nguyễn Hoàng Nam", email: "hoangnam.nguyen@gmail.com", phone: "0912345678", role: "Customer", status: "Active", created_at: "2026-01-15T02:00:00.000Z", has_staff_profile: false },
  { user_id: 9011, full_name: "Trần Thị Mai Anh", email: "maianh.tran@outlook.com", phone: "0988765432", role: "Customer", status: "Active", created_at: "2026-02-22T02:00:00.000Z", has_staff_profile: false },
  { user_id: 9012, full_name: "Võ Thảo Vy", email: "thaovy.vo@gmail.com", phone: "0945667788", role: "Customer", status: "Active", created_at: "2026-06-02T02:00:00.000Z", has_staff_profile: false },
];

export function createDemoAccountSource(initial: readonly AccountRow[] = DEMO_ACCOUNTS): AccountSource {
  let rows = [...initial];
  return {
    isDemo: true,
    async list(query) { return filterAccounts(rows, query); },
    async updateAccess(userId, patch) {
      const result = applyAccessPatch(rows, userId, patch);
      rows = result.rows;
      return result.updated;
    },
  };
}
