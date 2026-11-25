import type { Page } from "@/schemas/catalog";
import type { CustomerDetailDto, CustomerSummaryDto } from "@/schemas/customer";
import type { InvoiceDto } from "@/schemas/invoice";
import type {
  StaffInvoiceDetailDto,
  StaffInvoiceSummaryDto,
  StaffTicketSearchResultDto,
} from "@/schemas/staff-invoice";
import { BookingClientError } from "./booking-client";

export type ManagedInvoiceStatus = InvoiceDto["status"];
export type ManagedTicketStatus = InvoiceDto["tickets"][number]["status"];
export type ManagedCheckInStatus = "Pending" | "CheckedIn" | "Absent";

export type ManagedTicketView = {
  detailId: number;
  invoiceId: number;
  paymentCode: string | null;
  invoiceStatus: ManagedInvoiceStatus;
  departureId: number;
  tripName: string;
  departureAt: string;
  customerId: number | null;
  customerName: string;
  passengerName: string;
  passengerPhone?: string | null;
  seatName: string;
  pickupName?: string | null;
  pickupAddress?: string | null;
  pickupAt?: string | null;
  unitPrice?: string | null;
  status: ManagedTicketStatus;
  checkInStatus: ManagedCheckInStatus;
  responsibleNameSnapshot: string | null;
  responsibleRoleSnapshot: string | null;
};

export type ManagedInvoiceView = {
  invoiceId: number;
  paymentCode: string | null;
  departureId: number;
  tripName: string;
  departureAt: string;
  customerId: number | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  status: ManagedInvoiceStatus;
  totalAmount: string;
  createdAt: string;
  expiresAt: string;
  responsibleNameSnapshot: string | null;
  responsibleRoleSnapshot: string | null;
  ticketCount?: number;
  tickets: {
    detailId: number;
    seatName: string;
    passengerName: string;
    pickupName?: string | null;
    pickupAddress?: string | null;
    pickupAt?: string | null;
    unitPrice?: string | null;
    status: ManagedTicketStatus;
    checkInStatus: ManagedCheckInStatus;
  }[];
};

export type ResponsibleStaffOption = {
  userId: number;
  fullName: string;
};

export type DepartureFilterOption = {
  departureId: number;
  tripName: string;
  departureAt: string;
};

export type InvoiceManagementQuery = {
  page: number;
  q: string;
  invoiceStatus: "all" | ManagedInvoiceStatus;
  ticketStatus: "all" | ManagedTicketStatus;
  checkInStatus: "all" | ManagedCheckInStatus;
  departureId: number | null;
  responsibleUserId: number | null;
};

export type InvoiceManagementPageResult = {
  invoices: ManagedInvoiceView[];
  tickets: ManagedTicketView[];
  departures: DepartureFilterOption[];
  responsibleStaffOptions: ResponsibleStaffOption[];
  page: number;
  totalPages: number;
  totalInvoices: number;
  totalTickets: number;
};

export type InvoiceManagementSource = {
  readManagementPage: (
    query: InvoiceManagementQuery,
    signal: AbortSignal,
  ) => Promise<InvoiceManagementPageResult>;
  readInvoiceDetail?: (
    invoiceId: number,
    signal: AbortSignal,
  ) => Promise<ManagedInvoiceView>;
};

export type InvoiceManagementCapabilities = {
  canAccessWorkspace: boolean;
  canFilterByResponsibleStaff: boolean;
  canReadAllInvoices: boolean;
  scopeLabel: string;
};

export function invoiceManagementCapabilities(role?: string | null): InvoiceManagementCapabilities {
  if (role === "Admin") {
    return {
      canAccessWorkspace: true,
      canFilterByResponsibleStaff: true,
      canReadAllInvoices: true,
      scopeLabel: "Toàn bộ hóa đơn và vé trên hệ thống (cho phép lọc theo nhân viên phụ trách)",
    };
  }
  if (role === "RouteMgr") {
    return {
      canAccessWorkspace: true,
      canFilterByResponsibleStaff: false,
      canReadAllInvoices: false,
      scopeLabel: "Chỉ các hóa đơn và vé thuộc các chuyến do bạn đứng tên phụ trách",
    };
  }
  return {
    canAccessWorkspace: false,
    canFilterByResponsibleStaff: false,
    canReadAllInvoices: false,
    scopeLabel: "Không có quyền truy cập phân hệ quản lý hóa đơn và vé",
  };
}

export function invoiceManagementReadScope(
  status: string,
  user?: { user_id: number; role: string } | null,
): string | null {
  if (
    status !== "authenticated" ||
    !user ||
    !Number.isSafeInteger(user.user_id) ||
    user.user_id < 1
  ) {
    return null;
  }
  if (user.role !== "Admin" && user.role !== "RouteMgr") {
    return null;
  }
  return `staff-invoices:${user.role}:${user.user_id}`;
}

export function clampPageNumber(requestedPage: number, totalPages: number): number {
  const maxPage = Math.max(1, Number.isSafeInteger(totalPages) ? totalPages : 1);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) return 1;
  return Math.min(requestedPage, maxPage);
}

export function normalizeInvoiceManagementQuery(
  raw: Partial<InvoiceManagementQuery>,
  role?: string | null,
): InvoiceManagementQuery {
  const page = Number.isSafeInteger(raw.page) && (raw.page ?? 0) >= 1 ? raw.page! : 1;
  const q = String(raw.q ?? "").trim().slice(0, 100);
  const invoiceStatus =
    raw.invoiceStatus && ["Pending", "Paid", "Expired", "Cancelled"].includes(raw.invoiceStatus)
      ? raw.invoiceStatus
      : "all";
  const ticketStatus =
    raw.ticketStatus && ["Pending", "Valid", "Cancelled"].includes(raw.ticketStatus)
      ? raw.ticketStatus
      : "all";
  const checkInStatus =
    raw.checkInStatus && ["Pending", "CheckedIn", "Absent"].includes(raw.checkInStatus)
      ? raw.checkInStatus
      : "all";
  const departureId =
    typeof raw.departureId === "number" &&
    Number.isSafeInteger(raw.departureId) &&
    raw.departureId >= 1
      ? raw.departureId
      : null;

  const canFilterByStaff = role === "Admin";
  const responsibleUserId =
    canFilterByStaff &&
    typeof raw.responsibleUserId === "number" &&
    Number.isSafeInteger(raw.responsibleUserId) &&
    raw.responsibleUserId >= 1
      ? raw.responsibleUserId
      : null;

  return {
    page,
    q,
    invoiceStatus,
    ticketStatus,
    checkInStatus,
    departureId,
    responsibleUserId,
  };
}

export function formatResponsibleStaffSnapshot(invoice: {
  responsibleNameSnapshot: string | null | undefined;
  responsibleRoleSnapshot: string | null | undefined;
}): {
  nameLabel: string;
  roleLabel: string | null;
  attributionNote: string;
} {
  const name = invoice.responsibleNameSnapshot?.trim();
  const role = invoice.responsibleRoleSnapshot?.trim();
  const attributionNote =
    "Thông tin nhân viên phụ trách được ghi nhận cố định tại thời điểm tạo hóa đơn theo phân công chuyến; không đồng nghĩa nhân viên này đã kiểm duyệt tiền thủ công.";

  if (!name) {
    return {
      nameLabel: "Chưa ghi nhận nhân viên phụ trách (dữ liệu lịch sử)",
      roleLabel: null,
      attributionNote,
    };
  }

  const roleLabel =
    role === "RouteMgr"
      ? "Quản lý Tuyến & Web (RouteMgr)"
      : role
        ? role
        : null;

  return {
    nameLabel: name,
    roleLabel,
    attributionNote,
  };
}

export type StatusBadgeTone = "success" | "warning" | "neutral" | "danger";

export function describeInvoicePaymentAndCheckIn(input: {
  invoiceStatus: ManagedInvoiceStatus;
  ticketStatus: ManagedTicketStatus;
  checkInStatus: ManagedCheckInStatus;
}): {
  invoiceStatusLabel: string;
  invoiceStatusTone: StatusBadgeTone;
  ticketStatusLabel: string;
  ticketStatusTone: StatusBadgeTone;
  checkInStatusLabel: string;
  checkInStatusTone: StatusBadgeTone;
} {
  const invoiceMap: Record<ManagedInvoiceStatus, { label: string; tone: StatusBadgeTone }> = {
    Paid: { label: "Đã thanh toán", tone: "success" },
    Pending: { label: "Chờ thanh toán", tone: "warning" },
    Expired: { label: "Hết hạn giữ ghế", tone: "neutral" },
    Cancelled: { label: "Đã hủy giữ ghế", tone: "danger" },
  };

  const ticketMap: Record<ManagedTicketStatus, { label: string; tone: StatusBadgeTone }> = {
    Valid: { label: "Vé hợp lệ", tone: "success" },
    Pending: { label: "Chờ phát hành vé", tone: "warning" },
    Cancelled: { label: "Vé không còn hiệu lực", tone: "neutral" },
  };

  const checkInMap: Record<ManagedCheckInStatus, { label: string; tone: StatusBadgeTone }> = {
    CheckedIn: { label: "Đã lên xe", tone: "success" },
    Pending: { label: "Chưa điểm danh", tone: "neutral" },
    Absent: { label: "Vắng mặt", tone: "danger" },
  };

  const inv = invoiceMap[input.invoiceStatus];
  const tkt = ticketMap[input.ticketStatus];
  const chk = checkInMap[input.checkInStatus];

  return {
    invoiceStatusLabel: inv.label,
    invoiceStatusTone: inv.tone,
    ticketStatusLabel: tkt.label,
    ticketStatusTone: tkt.tone,
    checkInStatusLabel: chk.label,
    checkInStatusTone: chk.tone,
  };
}

export function mapCustomerDetailToManagedInvoices(
  detail: CustomerDetailDto,
): ManagedInvoiceView[] {
  return detail.bookings.map((booking) => ({
    invoiceId: booking.invoice_id,
    paymentCode: null,
    departureId: booking.departure_id,
    tripName: booking.trip_name,
    departureAt: booking.departure_date,
    customerId: detail.customer.user_id,
    customerName: detail.customer.full_name,
    customerEmail: detail.customer.email,
    customerPhone: detail.customer.phone,
    status: booking.status,
    totalAmount: booking.total_amount,
    createdAt: booking.created_at,
    expiresAt: booking.expires_at,
    responsibleNameSnapshot: booking.responsible_name_snapshot,
    responsibleRoleSnapshot: booking.responsible_role_snapshot,
    ticketCount: booking.tickets.length,
    tickets: booking.tickets.map((ticket) => ({
      detailId: ticket.detail_id,
      seatName: ticket.seat_name,
      passengerName: ticket.passenger_name,
      pickupName: null,
      pickupAddress: null,
      pickupAt: null,
      unitPrice: null,
      status: ticket.status,
      checkInStatus: ticket.check_in_status,
    })),
  }));
}

async function readStaffJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new BookingClientError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "Không thể tải dữ liệu lúc này.",
    );
  }
  if (!body?.data) {
    throw new BookingClientError(502, "INVALID_RESPONSE", "Dữ liệu trả về không hợp lệ.");
  }
  return body.data as T;
}

export function fetchStaffCustomersPage(
  params: { page: number; q?: string; status?: "Active" | "Locked" },
  signal: AbortSignal,
): Promise<Page<CustomerSummaryDto>> {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: "10",
  });
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.status) search.set("status", params.status);
  return readStaffJson<Page<CustomerSummaryDto>>(
    `/api/staff/customers?${search.toString()}`,
    signal,
  );
}

export function fetchStaffCustomerDetail(
  customerId: number,
  signal: AbortSignal,
): Promise<CustomerDetailDto> {
  return readStaffJson<CustomerDetailDto>(`/api/staff/customers/${customerId}`, signal);
}

const STAFF_MANAGEMENT_PAGE_SIZE = 10;
const FULL_TICKET_CODE_PATTERN = /^TK[0-9A-Fa-f]{20}$/i;

/**
 * Builds strict query parameters for GET /api/staff/invoices, omitting empty/unselected filters
 * because the API rejects empty or unknown query parameters with HTTP 422.
 */
export function buildStaffInvoiceSearchParams(query: InvoiceManagementQuery): URLSearchParams {
  const params = new URLSearchParams({
    page: String(clampPageNumber(query.page, Number.MAX_SAFE_INTEGER)),
    pageSize: String(STAFF_MANAGEMENT_PAGE_SIZE),
  });
  if (query.invoiceStatus !== "all") params.set("status", query.invoiceStatus);
  if (query.departureId !== null) params.set("departure_id", String(query.departureId));
  if (query.responsibleUserId !== null) {
    params.set("responsible_user_id", String(query.responsibleUserId));
  }
  const term = query.q.trim();
  if (term) params.set("search", term);
  return params;
}

/**
 * Builds strict query parameters for GET /api/staff/tickets, routing the search keyword to
 * exact full ticket code, phone digits, or passenger name without leaking partial ticket codes.
 */
export function buildStaffTicketSearchParams(query: InvoiceManagementQuery): URLSearchParams {
  const params = new URLSearchParams({
    page: String(clampPageNumber(query.page, Number.MAX_SAFE_INTEGER)),
    pageSize: String(STAFF_MANAGEMENT_PAGE_SIZE),
  });
  if (query.ticketStatus !== "all") params.set("status", query.ticketStatus);
  if (query.checkInStatus !== "all") params.set("check_in_status", query.checkInStatus);
  if (query.departureId !== null) params.set("departure_id", String(query.departureId));
  const term = query.q.trim();
  if (term) {
    if (FULL_TICKET_CODE_PATTERN.test(term)) params.set("ticket_code", term);
    else if (/^\d+$/.test(term)) params.set("passenger_phone", term);
    else params.set("passenger_name", term);
  }
  return params;
}

function mapStaffInvoiceBase(dto: StaffInvoiceSummaryDto): Omit<ManagedInvoiceView, "tickets"> {
  return {
    invoiceId: dto.invoice_id,
    paymentCode: dto.payment_code,
    departureId: dto.departure.departure_id,
    tripName: dto.departure.trip_name,
    departureAt: dto.departure.departure_date,
    customerId: dto.customer.user_id,
    customerName: dto.customer.full_name,
    customerEmail: null,
    customerPhone: dto.customer.phone,
    status: dto.status,
    totalAmount: dto.total_amount,
    createdAt: dto.created_at,
    expiresAt: dto.expires_at,
    responsibleNameSnapshot: dto.responsible_name_snapshot,
    responsibleRoleSnapshot: dto.responsible_role_snapshot,
    ticketCount: dto.ticket_count,
  };
}

/** Maps a staff invoice list DTO without fabricating tickets (loaded lazily per dialog open). */
export function mapStaffInvoiceSummaryToView(dto: StaffInvoiceSummaryDto): ManagedInvoiceView {
  return {
    ...mapStaffInvoiceBase(dto),
    tickets: [],
  };
}

/** Maps a staff invoice detail DTO including per-ticket status, check-in status, and pickup point. */
export function mapStaffInvoiceDetailToView(dto: StaffInvoiceDetailDto): ManagedInvoiceView {
  return {
    ...mapStaffInvoiceBase(dto),
    ticketCount: dto.tickets.length,
    tickets: dto.tickets.map((ticket) => ({
      detailId: ticket.detail_id,
      seatName: ticket.seat_name,
      passengerName: ticket.passenger_name,
      pickupName: ticket.pickup.name,
      pickupAddress: ticket.pickup.address,
      pickupAt: ticket.pickup.pickup_time,
      unitPrice: ticket.unit_price,
      status: ticket.status,
      checkInStatus: ticket.check_in_status,
    })),
  };
}

/** Maps a staff ticket search DTO without inventing missing customer, pickup, or role fields. */
export function mapStaffTicketToView(dto: StaffTicketSearchResultDto): ManagedTicketView {
  return {
    detailId: dto.detail_id,
    invoiceId: dto.invoice_id,
    paymentCode: dto.invoice.payment_code,
    invoiceStatus: dto.invoice.status,
    departureId: dto.departure.departure_id,
    tripName: dto.departure.trip_name,
    departureAt: dto.departure.departure_date,
    customerId: null,
    customerName: "—",
    passengerName: dto.passenger_name,
    passengerPhone: dto.passenger_phone,
    seatName: dto.seat_name,
    pickupName: null,
    pickupAddress: null,
    pickupAt: null,
    unitPrice: dto.unit_price,
    status: dto.status,
    checkInStatus: dto.check_in_status,
    responsibleNameSnapshot: dto.invoice.responsible_name_snapshot,
    responsibleRoleSnapshot: null,
  };
}

/** Combines paginated M01 invoice and ticket responses into the M02 workspace presentation payload. */
export function mapStaffManagementPage(
  query: InvoiceManagementQuery,
  invoicesPage: Page<StaffInvoiceSummaryDto>,
  ticketsPage: Page<StaffTicketSearchResultDto>,
): InvoiceManagementPageResult {
  const invoices = invoicesPage.items.map(mapStaffInvoiceSummaryToView);
  const tickets = ticketsPage.items.map(mapStaffTicketToView);

  const departures: DepartureFilterOption[] = [];
  const seenDepartures = new Set<number>();
  for (const invoice of invoices) {
    if (seenDepartures.has(invoice.departureId)) continue;
    seenDepartures.add(invoice.departureId);
    departures.push({
      departureId: invoice.departureId,
      tripName: invoice.tripName,
      departureAt: invoice.departureAt,
    });
  }

  return {
    invoices,
    tickets,
    departures,
    responsibleStaffOptions: [],
    page: clampPageNumber(query.page, Number.MAX_SAFE_INTEGER),
    totalPages: Math.max(invoicesPage.pagination.totalPages, ticketsPage.pagination.totalPages),
    totalInvoices: invoicesPage.pagination.totalItems,
    totalTickets: ticketsPage.pagination.totalItems,
  };
}

/** M01-backed data source for /staff/invoices. Does not list responsible user IDs or ticket codes. */
export const staffInvoiceSource: InvoiceManagementSource = {
  async readManagementPage(query, signal) {
    const invoiceParams = buildStaffInvoiceSearchParams(query);
    const ticketParams = buildStaffTicketSearchParams(query);
    const [invoicesPage, ticketsPage] = await Promise.all([
      readStaffJson<Page<StaffInvoiceSummaryDto>>(
        `/api/staff/invoices?${invoiceParams.toString()}`,
        signal,
      ),
      readStaffJson<Page<StaffTicketSearchResultDto>>(
        `/api/staff/tickets?${ticketParams.toString()}`,
        signal,
      ),
    ]);
    return mapStaffManagementPage(query, invoicesPage, ticketsPage);
  },
  async readInvoiceDetail(invoiceId, signal) {
    const detail = await readStaffJson<StaffInvoiceDetailDto>(
      `/api/staff/invoices/${invoiceId}`,
      signal,
    );
    return mapStaffInvoiceDetailToView(detail);
  },
};
