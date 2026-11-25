"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  FileClock,
  FileSpreadsheet,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import { formatVietnamDateTime, formatVnd } from "@/lib/catalog-client";
import { BookingClientError } from "@/lib/booking-client";
import type { Page } from "@/schemas/catalog";
import type { CustomerDetailDto, CustomerSummaryDto } from "@/schemas/customer";
import {
  clampPageNumber,
  fetchStaffCustomerDetail,
  fetchStaffCustomersPage,
  formatResponsibleStaffSnapshot,
  invoiceManagementReadScope,
  mapCustomerDetailToManagedInvoices,
  type InvoiceManagementSource,
  type ManagedCheckInStatus,
  type ManagedInvoiceStatus,
  type ManagedInvoiceView,
  type ManagedTicketStatus,
} from "@/lib/invoice-management-ui";
import {
  useInvoiceManagement,
  type InvoiceManagementPhase,
} from "./use-invoice-management";
import {
  CheckInStatusBadge,
  InvoiceDetailDialog,
  InvoiceStatusBadge,
  TicketStatusBadge,
} from "./invoice-detail-dialog";

const controlClass =
  "min-h-11 rounded-[5px] border border-[#6B7280] bg-white px-3 text-sm text-[#212529] disabled:bg-neutral-100 disabled:text-[#5C636A]";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] border border-[#6B7280] bg-white px-4 text-sm font-semibold text-[#212529] hover:bg-neutral-50 disabled:bg-neutral-100 disabled:text-[#5C636A]";
const brandButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] bg-[#186734] px-4 text-sm font-semibold text-white hover:bg-[#125228] disabled:bg-neutral-200 disabled:text-[#5C636A]";
const primaryYellowButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] bg-[#FEBB02] px-4 text-sm font-bold text-black hover:bg-[#E5A800] disabled:bg-neutral-200 disabled:text-[#5C636A]";

const dateOptions: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

type WorkspaceTab = "invoices" | "tickets" | "customers";

export type CustomerDirectorySource = {
  listCustomers: (
    params: { page: number; q?: string },
    signal: AbortSignal,
  ) => Promise<Page<CustomerSummaryDto>>;
  readCustomer: (customerId: number, signal: AbortSignal) => Promise<CustomerDetailDto>;
};

const defaultCustomerSource: CustomerDirectorySource = {
  listCustomers: fetchStaffCustomersPage,
  readCustomer: fetchStaffCustomerDetail,
};

function PhaseNotice({
  phase,
  hasModal,
  onRetry,
  onOpenCustomerLookup,
}: {
  phase: InvoiceManagementPhase;
  hasModal: boolean;
  onRetry: () => void;
  onOpenCustomerLookup?: () => void;
}) {
  if (phase === "ready") return null;

  if (phase === "auth-loading" || phase === "loading") {
    return (
      <p role="status" className="py-12 text-center text-sm text-[#5C636A]">
        {phase === "auth-loading"
          ? "Đang kiểm tra phiên đăng nhập…"
          : "Đang tải danh sách hóa đơn và vé…"}
      </p>
    );
  }

  if (phase === "sign-in") {
    return (
      <div className="space-y-4 rounded-[6px] border border-[#E0E0E0] bg-white p-8 text-center">
        <p className="text-sm text-[#212529]">
          Vui lòng đăng nhập cổng nội bộ để xem danh sách hóa đơn và tra cứu vé.
        </p>
        <Link
          href={`/staff/login?callbackUrl=${encodeURIComponent("/staff/invoices")}`}
          className={hasModal ? secondaryButtonClass : primaryYellowButtonClass}
        >
          Đăng nhập nội bộ
        </Link>
      </div>
    );
  }

  if (phase === "forbidden") {
    return (
      <div
        role="alert"
        className="space-y-3 rounded-[6px] border border-[#E0E0E0] bg-white p-8 text-center"
      >
        <ShieldCheck aria-hidden="true" className="mx-auto size-8 text-[#5C636A]" />
        <h2 className="text-base font-bold text-[#212529]">
          Bạn không có quyền truy cập màn hình quản lý hóa đơn
        </h2>
        <p className="mx-auto max-w-md text-sm leading-6 text-[#5C636A]">
          Chỉ Quản lý Tuyến (đối với hóa đơn được giao phụ trách) và Quản trị viên mới được xem thông tin hóa đơn và vé tại đây.
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div
        role="alert"
        className="space-y-4 rounded-[6px] border border-[#E0E0E0] bg-white p-8 text-center"
      >
        <p className="text-sm font-semibold text-[#C62828]">
          Không thể tải danh sách hóa đơn và vé lúc này. Dữ liệu cũ đã được ẩn để tránh nhầm lẫn.
        </p>
        <button type="button" onClick={onRetry} className={secondaryButtonClass}>
          Thử tải lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[6px] border border-[#E0E0E0] bg-white p-8 text-center">
      <FileClock aria-hidden="true" className="mx-auto size-9 text-[#5C636A]" />
      <h2 className="text-base font-bold text-[#212529]">
        Danh sách hóa đơn tổng hợp chưa sẵn sàng
      </h2>
      <p className="mx-auto max-w-lg text-sm leading-6 text-[#5C636A]">
        Dịch vụ tra cứu hóa đơn và vé tổng hợp theo chuyến hiện chưa được kết nối. Màn hình không hiển thị hóa đơn mẫu để đảm bảo tính chính xác của dữ liệu tài chính và vận hành.
      </p>
      {onOpenCustomerLookup && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onOpenCustomerLookup}
            className={secondaryButtonClass}
          >
            Chuyển sang tra cứu lịch sử đặt vé theo khách hàng
          </button>
        </div>
      )}
    </div>
  );
}

export function InvoiceManagementWorkspace({
  source,
  customerSource = defaultCustomerSource,
}: {
  source?: InvoiceManagementSource;
  customerSource?: CustomerDirectorySource;
}) {
  const session = useSession();
  const scope = invoiceManagementReadScope(session.status, session.data?.user);
  return (
    <InvoiceManagementWorkspaceInner
      key={`${session.status}:${scope}`}
      source={source}
      customerSource={customerSource}
    />
  );
}

function InvoiceManagementWorkspaceInner({
  source,
  customerSource,
}: {
  source?: InvoiceManagementSource;
  customerSource: CustomerDirectorySource;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("invoices");

  // Applied M01 query
  const [query, setQuery] = useState<{
    page: number;
    q: string;
    invoiceStatus: "all" | ManagedInvoiceStatus;
    ticketStatus: "all" | ManagedTicketStatus;
    checkInStatus: "all" | ManagedCheckInStatus;
    departureId: number | null;
    responsibleUserId: number | null;
  }>({
    page: 1,
    q: "",
    invoiceStatus: "all",
    ticketStatus: "all",
    checkInStatus: "all",
    departureId: null,
    responsibleUserId: null,
  });

  // Draft controls before clicking "Áp dụng bộ lọc"
  const [qDraft, setQDraft] = useState("");
  const [invoiceStatusDraft, setInvoiceStatusDraft] = useState<"all" | ManagedInvoiceStatus>("all");
  const [ticketStatusDraft, setTicketStatusDraft] = useState<"all" | ManagedTicketStatus>("all");
  const [checkInStatusDraft, setCheckInStatusDraft] = useState<"all" | ManagedCheckInStatus>("all");
  const [departureDraft, setDepartureDraft] = useState<number | "all">("all");
  const [responsibleDraft, setResponsibleDraft] = useState<number | "all">("all");

  const [selectedModal, setSelectedModal] = useState<{
    invoiceId: number;
    preview: ManagedInvoiceView | null;
  } | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  const [detailState, setDetailState] = useState<{
    invoiceId: number;
    status: "loading" | "ready" | "error";
    invoice?: ManagedInvoiceView;
    errorMessage?: string;
  } | null>(null);

  const read = useInvoiceManagement(source, query);
  const { capabilities, data } = read;

  // Clamp page if totalPages shrank
  if (data && query.page > Math.max(1, data.totalPages)) {
    const clamped = clampPageNumber(query.page, data.totalPages);
    setQuery((prev) => ({ ...prev, page: clamped }));
    setSelectedModal(null);
  }

  // Customer tab state (connected to /api/staff/customers)
  const [customerSearchDraft, setCustomerSearchDraft] = useState("");
  const [customerAppliedQuery, setCustomerAppliedQuery] = useState({ page: 1, q: "" });
  const [customerPageState, setCustomerPageState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    data?: Page<CustomerSummaryDto>;
  }>({ status: "idle" });

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerDetailState, setCustomerDetailState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    detail?: CustomerDetailDto;
    invoices?: ManagedInvoiceView[];
  }>({ status: "idle" });

  useEffect(() => {
    if (activeTab !== "customers" || !capabilities.canAccessWorkspace) return;
    const controller = new AbortController();

    async function loadCustomers() {
      setCustomerPageState({ status: "loading" });
      try {
        const res = await customerSource.listCustomers(
          { page: customerAppliedQuery.page, q: customerAppliedQuery.q },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setCustomerPageState({ status: "ready", data: res });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof BookingClientError && err.status === 401) {
          setCustomerPageState({ status: "error" });
          return;
        }
        setCustomerPageState({ status: "error" });
      }
    }

    void loadCustomers();
    return () => controller.abort();
  }, [activeTab, capabilities.canAccessWorkspace, customerAppliedQuery, customerSource]);

  useEffect(() => {
    if (activeTab !== "customers" || !selectedCustomerId || !capabilities.canAccessWorkspace) return;
    const controller = new AbortController();

    async function loadCustomerBookings() {
      setCustomerDetailState({ status: "loading" });
      try {
        const detail = await customerSource.readCustomer(selectedCustomerId!, controller.signal);
        if (!controller.signal.aborted) {
          setCustomerDetailState({
            status: "ready",
            detail,
            invoices: mapCustomerDetailToManagedInvoices(detail),
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setCustomerDetailState({ status: "error" });
        }
      }
    }

    void loadCustomerBookings();
    return () => controller.abort();
  }, [activeTab, selectedCustomerId, capabilities.canAccessWorkspace, customerSource]);

  const detailFetchInvoiceId =
    selectedModal &&
    source?.readInvoiceDetail &&
    (!selectedModal.preview || selectedModal.preview.tickets.length === 0)
      ? selectedModal.invoiceId
      : null;

  useEffect(() => {
    if (!detailFetchInvoiceId || !source?.readInvoiceDetail) return;
    const controller = new AbortController();

    async function loadInvoiceDetail() {
      setDetailState({ invoiceId: detailFetchInvoiceId!, status: "loading" });
      try {
        const detail = await source!.readInvoiceDetail!(detailFetchInvoiceId!, controller.signal);
        if (!controller.signal.aborted) {
          setDetailState({ invoiceId: detailFetchInvoiceId!, status: "ready", invoice: detail });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const errorMessage =
          err instanceof BookingClientError && err.status === 404
            ? "Không tìm thấy hoặc bạn chỉ xem được chi tiết các hóa đơn do mình đứng tên phụ trách."
            : "Không thể tải chi tiết hóa đơn và danh sách vé lúc này.";
        setDetailState({
          invoiceId: detailFetchInvoiceId!,
          status: "error",
          errorMessage,
        });
      }
    }

    void loadInvoiceDetail();
    return () => controller.abort();
  }, [detailFetchInvoiceId, detailRevision, source]);

  function openInvoiceDetail(invoiceId: number, preview: ManagedInvoiceView | null = null) {
    setDetailState(null);
    setSelectedModal({ invoiceId, preview });
  }

  const needsDetailFetch = Boolean(
    selectedModal &&
      source?.readInvoiceDetail &&
      (!selectedModal.preview || selectedModal.preview.tickets.length === 0),
  );
  const isDetailLoading =
    needsDetailFetch &&
    (!detailState ||
      detailState.invoiceId !== selectedModal?.invoiceId ||
      detailState.status === "loading");

  const hasOpenModal = selectedModal !== null;
  const staffOptions = data?.responsibleStaffOptions ?? [];
  const hasStaffFilterOptions = staffOptions.length > 0;
  const isStaffFilterUnavailable =
    capabilities.canFilterByResponsibleStaff &&
    read.phase === "ready" &&
    !hasStaffFilterOptions;
  const canFilterM01 = !!source && (read.phase === "ready" || read.phase === "error");

  function handleApplyM01Filter(event: FormEvent) {
    event.preventDefault();
    if (!canFilterM01) return;
    setSelectedModal(null);
    setQuery({
      page: 1,
      q: qDraft.trim(),
      invoiceStatus: invoiceStatusDraft,
      ticketStatus: ticketStatusDraft,
      checkInStatus: checkInStatusDraft,
      departureId: departureDraft === "all" ? null : departureDraft,
      responsibleUserId:
        capabilities.canFilterByResponsibleStaff &&
        hasStaffFilterOptions &&
        responsibleDraft !== "all"
          ? responsibleDraft
          : null,
    });
  }

  function handleResetM01Filters() {
    setQDraft("");
    setInvoiceStatusDraft("all");
    setTicketStatusDraft("all");
    setCheckInStatusDraft("all");
    setDepartureDraft("all");
    setResponsibleDraft("all");
    setSelectedModal(null);
    setQuery({
      page: 1,
      q: "",
      invoiceStatus: "all",
      ticketStatus: "all",
      checkInStatus: "all",
      departureId: null,
      responsibleUserId: null,
    });
  }

  function handleJumpToDeparture(departureId: number) {
    setDepartureDraft(departureId);
    setQuery((prev) => ({ ...prev, page: 1, departureId }));
  }

  function handleJumpToCustomer(customerId: number, customerName: string) {
    setActiveTab("customers");
    setCustomerSearchDraft(customerName);
    setCustomerAppliedQuery({ page: 1, q: customerName });
    setSelectedCustomerId(customerId);
  }

  function handleCustomerFilterSubmit(event: FormEvent) {
    event.preventDefault();
    setSelectedCustomerId(null);
    setCustomerDetailState({ status: "idle" });
    setCustomerAppliedQuery({ page: 1, q: customerSearchDraft.trim() });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <p className="text-sm font-semibold text-[#186734]">
            Nghiệp vụ hóa đơn & vé hành khách
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            Quản lý hóa đơn và vé theo chuyến, khách hàng
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C636A]">
            {capabilities.scopeLabel}. Phân biệt rõ trạng thái thanh toán của hóa đơn/vé và trạng thái điểm danh lên xe; hiển thị đúng nhân viên phụ trách từ bản lưu lịch sử.
          </p>
        </div>

        <button
          type="button"
          disabled={
            activeTab === "customers"
              ? customerPageState.status === "loading"
              : !source || read.phase !== "ready"
          }
          onClick={() => {
            if (activeTab === "customers") {
              setCustomerAppliedQuery((prev) => ({ ...prev }));
            } else {
              read.refresh();
            }
          }}
          className={secondaryButtonClass}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          Làm mới danh sách
        </button>
      </div>

      {/* Policy & Role Notice */}
      <p className="border-l-4 border-[#186734] bg-white p-4 text-sm leading-6 text-[#5C636A] print:hidden">
        Màn hình này dùng để tra cứu và in phiếu thông tin hóa đơn, vé theo chuyến hoặc khách hàng. Không có thao tác hoàn tiền, hủy vé đã mua hoặc tự ý đổi trạng thái thanh toán tại đây; tên nhân viên phụ trách trên hóa đơn là thông tin phân công cố định lúc lập đơn, không phải xác nhận đã duyệt tiền.
      </p>

      {/* Check top-level auth/forbidden state before showing tabs */}
      {(read.phase === "auth-loading" ||
        read.phase === "sign-in" ||
        read.phase === "forbidden") && (
        <PhaseNotice
          phase={read.phase}
          hasModal={hasOpenModal}
          onRetry={read.refresh}
        />
      )}

      {capabilities.canAccessWorkspace &&
        read.phase !== "auth-loading" &&
        read.phase !== "sign-in" &&
        read.phase !== "forbidden" && (
          <>
            {/* Navigation Tabs */}
            <div
              role="tablist"
              aria-label="Chế độ tra cứu hóa đơn và vé"
              className="flex flex-wrap gap-2 border-b border-neutral-300 pb-3 print:hidden"
            >
              {(
                [
                  ["invoices", "Danh sách hóa đơn", FileSpreadsheet],
                  ["tickets", "Tra cứu vé theo chuyến & khách", Ticket],
                  ["customers", "Hóa đơn & vé theo khách hàng", Users],
                ] as const
              ).map(([tabKey, label, Icon]) => {
                const selected = activeTab === tabKey;
                return (
                  <button
                    key={tabKey}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(tabKey)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-[5px] px-4 text-sm font-semibold ${
                      selected
                        ? "bg-[#186734] text-white"
                        : "border border-[#6B7280] bg-white text-[#212529] hover:bg-neutral-50"
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {label}
                  </button>
                );
              })}
            </div>

            {/* M01 TABS: INVOICES & TICKETS */}
            {(activeTab === "invoices" || activeTab === "tickets") && (
              <>
                <form
                  onSubmit={handleApplyM01Filter}
                  className="space-y-4 rounded-[6px] border border-[#E0E0E0] bg-white p-4 print:hidden"
                >
                  <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex min-w-0 flex-col justify-between gap-1.5">
                      <label htmlFor="m01-search" className="text-sm font-semibold">
                        Tìm mã thanh toán, khách hoặc ghế
                      </label>
                      <input
                        id="m01-search"
                        type="search"
                        value={qDraft}
                        maxLength={100}
                        disabled={!canFilterM01}
                        placeholder="Ví dụ: TB000123, Nguyễn Văn A, A01…"
                        onChange={(e) => setQDraft(e.target.value)}
                        className={`${controlClass} w-full`}
                      />
                    </div>

                    <div className="flex min-w-0 flex-col justify-between gap-1.5">
                      <label htmlFor="m01-departure" className="text-sm font-semibold">
                        Chuyến khởi hành
                      </label>
                      <select
                        id="m01-departure"
                        value={departureDraft === "all" ? "all" : String(departureDraft)}
                        disabled={!canFilterM01}
                        onChange={(e) =>
                          setDepartureDraft(
                            e.target.value === "all" ? "all" : Number(e.target.value),
                          )
                        }
                        className={`${controlClass} w-full`}
                      >
                        <option value="all">Tất cả chuyến</option>
                        {departureDraft !== "all" &&
                          !(data?.departures ?? []).some(
                            (dep) => dep.departureId === departureDraft,
                          ) && (
                            <option value={String(departureDraft)}>
                              Chuyến #{departureDraft}
                            </option>
                          )}
                        {(data?.departures ?? []).map((dep) => (
                          <option key={dep.departureId} value={String(dep.departureId)}>
                            #{dep.departureId} · {dep.tripName} (
                            {formatVietnamDateTime(dep.departureAt, dateOptions)})
                          </option>
                        ))}
                      </select>
                    </div>

                    {activeTab === "invoices" ? (
                      <>
                        <div className="flex min-w-0 flex-col justify-between gap-1.5">
                          <label htmlFor="m01-invoice-status" className="text-sm font-semibold">
                            Trạng thái hóa đơn (Thanh toán)
                          </label>
                          <select
                            id="m01-invoice-status"
                            value={invoiceStatusDraft}
                            disabled={!canFilterM01}
                            onChange={(e) =>
                              setInvoiceStatusDraft(
                                e.target.value as "all" | ManagedInvoiceStatus,
                              )
                            }
                            className={`${controlClass} w-full`}
                          >
                            <option value="all">Tất cả trạng thái</option>
                            <option value="Paid">Đã thanh toán</option>
                            <option value="Pending">Chờ thanh toán</option>
                            <option value="Expired">Hết hạn giữ ghế</option>
                            <option value="Cancelled">Đã hủy giữ ghế</option>
                          </select>
                        </div>

                        {capabilities.canFilterByResponsibleStaff ? (
                          <div className="flex min-w-0 flex-col justify-between gap-1.5">
                            <label htmlFor="m01-responsible-staff" className="text-sm font-semibold">
                              Nhân viên phụ trách hóa đơn
                            </label>
                            <select
                              id="m01-responsible-staff"
                              value={
                                hasStaffFilterOptions && responsibleDraft !== "all"
                                  ? String(responsibleDraft)
                                  : "all"
                              }
                              disabled={!canFilterM01 || isStaffFilterUnavailable}
                              aria-describedby={
                                isStaffFilterUnavailable ? "m01-responsible-staff-note" : undefined
                              }
                              onChange={(e) =>
                                setResponsibleDraft(
                                  e.target.value === "all" ? "all" : Number(e.target.value),
                                )
                              }
                              className={`${controlClass} w-full`}
                            >
                              <option value="all">
                                {isStaffFilterUnavailable
                                  ? "Chưa hỗ trợ lọc theo nhân viên"
                                  : "Tất cả nhân viên phụ trách"}
                              </option>
                              {staffOptions.map((staff) => (
                                <option key={staff.userId} value={String(staff.userId)}>
                                  {staff.fullName} (#{staff.userId})
                                </option>
                              ))}
                            </select>
                            {isStaffFilterUnavailable && (
                              <p
                                id="m01-responsible-staff-note"
                                className="text-xs text-[#5C636A]"
                              >
                                API danh sách chưa trả responsible_user_id nên bộ lọc này chưa khả dụng.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex min-w-0 flex-col justify-between gap-1.5">
                            <span className="text-sm font-semibold">Phạm vi phụ trách</span>
                            <div className="flex min-h-11 items-center rounded-[5px] border border-[#E0E0E0] bg-[#F8F9FA] px-3 text-xs font-semibold text-[#5C636A]">
                              Chỉ hóa đơn do bạn đứng tên phụ trách
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex min-w-0 flex-col justify-between gap-1.5">
                          <label htmlFor="m01-ticket-status" className="text-sm font-semibold">
                            Trạng thái vé (Thanh toán)
                          </label>
                          <select
                            id="m01-ticket-status"
                            value={ticketStatusDraft}
                            disabled={!canFilterM01}
                            onChange={(e) =>
                              setTicketStatusDraft(
                                e.target.value as "all" | ManagedTicketStatus,
                              )
                            }
                            className={`${controlClass} w-full`}
                          >
                            <option value="all">Tất cả trạng thái vé</option>
                            <option value="Valid">Vé hợp lệ</option>
                            <option value="Pending">Chờ phát hành vé</option>
                            <option value="Cancelled">Vé không còn hiệu lực</option>
                          </select>
                        </div>

                        <div className="flex min-w-0 flex-col justify-between gap-1.5">
                          <label htmlFor="m01-checkin-status" className="text-sm font-semibold">
                            Điểm danh lên xe (Check-in)
                          </label>
                          <select
                            id="m01-checkin-status"
                            value={checkInStatusDraft}
                            disabled={!canFilterM01}
                            onChange={(e) =>
                              setCheckInStatusDraft(
                                e.target.value as "all" | ManagedCheckInStatus,
                              )
                            }
                            className={`${controlClass} w-full`}
                          >
                            <option value="all">Tất cả trạng thái điểm danh</option>
                            <option value="Pending">Chưa điểm danh</option>
                            <option value="CheckedIn">Đã lên xe</option>
                            <option value="Absent">Vắng mặt</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E0E0E0] pt-3">
                    <p className="text-xs text-[#5C636A]">
                      {capabilities.canFilterByResponsibleStaff
                        ? isStaffFilterUnavailable
                          ? "Quản trị viên xem toàn hệ thống (bộ lọc theo từng nhân viên phụ trách chưa khả dụng do API không trả ID phụ trách)."
                          : "Quản trị viên có thể lọc theo từng nhân viên phụ trách hóa đơn hoặc xem toàn hệ thống."
                        : "Danh sách tự động giới hạn theo các hóa đơn mà bạn được phân công đứng tên phụ trách."}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!canFilterM01}
                        onClick={handleResetM01Filters}
                        className={secondaryButtonClass}
                      >
                        Xóa bộ lọc
                      </button>
                      <button
                        type="submit"
                        disabled={!canFilterM01}
                        className={
                          hasOpenModal ? brandButtonClass : primaryYellowButtonClass
                        }
                      >
                        <Search aria-hidden="true" className="size-4" />
                        Áp dụng bộ lọc
                      </button>
                    </div>
                  </div>
                </form>

                <PhaseNotice
                  phase={read.phase}
                  hasModal={hasOpenModal}
                  onRetry={read.refresh}
                  onOpenCustomerLookup={() => setActiveTab("customers")}
                />

                {read.phase === "ready" && data && (
                  <>
                    {activeTab === "invoices" ? (
                      <section aria-label="Danh sách hóa đơn" className="space-y-4">
                        <p role="status" className="text-sm text-[#5C636A]">
                          Tìm thấy {data.totalInvoices} hóa đơn theo bộ lọc hiện tại · Trang{" "}
                          {data.page}/{Math.max(1, data.totalPages)}
                        </p>

                        {data.invoices.length > 0 ? (
                          <div
                            role="region"
                            aria-label="Bảng danh sách hóa đơn"
                            tabIndex={0}
                            className="relative overflow-x-auto rounded-[6px] border border-[#E0E0E0] bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
                          >
                            <table className="w-full min-w-[640px] border-collapse text-sm">
                              <caption className="sr-only">
                                Danh sách hóa đơn kèm người mua, chuyến khởi hành, nhân viên phụ trách snapshot và trạng thái thanh toán
                              </caption>
                              <thead className="border-b border-[#E0E0E0] bg-[#F8F9FA] text-left">
                                <tr>
                                  <th scope="col" className="px-3 py-3 font-semibold">
                                    Hóa đơn
                                  </th>
                                  <th scope="col" className="px-3 py-3 font-semibold">
                                    Khách & chuyến
                                  </th>
                                  <th scope="col" className="px-3 py-3 font-semibold">
                                    Nhân viên phụ trách
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-center font-semibold">
                                    Vé & điểm danh
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                                    Tổng tiền & thanh toán
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                                    Thao tác
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#E0E0E0]">
                                {data.invoices.map((invoice) => {
                                  const snap = formatResponsibleStaffSnapshot(invoice);
                                  const checkedInCount = invoice.tickets.filter(
                                    (t) => t.checkInStatus === "CheckedIn",
                                  ).length;
                                  const absentCount = invoice.tickets.filter(
                                    (t) => t.checkInStatus === "Absent",
                                  ).length;
                                  return (
                                    <tr key={invoice.invoiceId}>
                                      <th
                                        scope="row"
                                        className="px-3 py-3 text-left font-normal"
                                      >
                                        <p className="font-mono font-bold">
                                          #{invoice.invoiceId}
                                        </p>
                                        {invoice.paymentCode && (
                                          <p className="mt-0.5 font-mono text-xs text-[#5C636A]">
                                            {invoice.paymentCode}
                                          </p>
                                        )}
                                        <p className="mt-0.5 text-xs text-[#5C636A] whitespace-nowrap">
                                          {formatVietnamDateTime(
                                            invoice.createdAt,
                                            dateOptions,
                                          )}
                                        </p>
                                      </th>
                                      <td className="px-3 py-3">
                                        <p className="font-semibold">{invoice.customerName}</p>
                                        <p className="mt-0.5 text-xs font-medium text-[#212529]">
                                          {invoice.tripName}
                                        </p>
                                        <p className="mt-0.5 text-xs text-[#5C636A]">
                                          #{invoice.departureId} ·{" "}
                                          {formatVietnamDateTime(
                                            invoice.departureAt,
                                            dateOptions,
                                          )}
                                        </p>
                                        {invoice.customerId && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleJumpToCustomer(
                                                invoice.customerId!,
                                                invoice.customerName,
                                              )
                                            }
                                            className="mt-0.5 text-xs font-semibold text-[#186734] underline underline-offset-4"
                                          >
                                            Lịch sử khách #{invoice.customerId}
                                          </button>
                                        )}
                                      </td>
                                      <td className="px-3 py-3">
                                        <p className="font-medium">{snap.nameLabel}</p>
                                        {snap.roleLabel && (
                                          <p className="mt-0.5 text-xs text-[#5C636A]">
                                            {snap.roleLabel}
                                          </p>
                                        )}
                                      </td>
                                       <td className="px-3 py-3 text-center text-xs">
                                         <p className="font-mono font-semibold text-[#212529] whitespace-nowrap">
                                           {invoice.ticketCount ?? invoice.tickets.length} vé
                                         </p>
                                         <p className="mt-0.5 text-[#5C636A]">
                                           {invoice.tickets.length > 0
                                             ? `Lên xe: ${checkedInCount} · Vắng: ${absentCount}`
                                             : (invoice.ticketCount ?? 0) > 0
                                               ? "Xem chi tiết để xem điểm danh"
                                               : "Chưa có vé"}
                                         </p>
                                       </td>
                                       <td className="px-3 py-3 text-right">
                                         <p className="font-mono font-semibold whitespace-nowrap">
                                           {formatVnd(invoice.totalAmount)}
                                         </p>
                                         <div className="mt-1">
                                           <InvoiceStatusBadge status={invoice.status} />
                                         </div>
                                       </td>
                                       <td className="px-3 py-3 text-right">
                                         <button
                                           type="button"
                                           onClick={() => openInvoiceDetail(invoice.invoiceId, invoice)}
                                           aria-label={`Xem chi tiết hóa đơn #${invoice.invoiceId}`}
                                           className="min-h-11 whitespace-nowrap font-semibold text-[#186734] underline underline-offset-4"
                                         >
                                           Chi tiết & in
                                         </button>
                                       </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="space-y-3 rounded-[6px] border border-[#E0E0E0] bg-white py-10 text-center">
                            <FileSpreadsheet
                              aria-hidden="true"
                              className="mx-auto size-9 text-[#5C636A]"
                            />
                            <h2 className="font-bold">Không có hóa đơn khớp bộ lọc</h2>
                            <p className="text-sm text-[#5C636A]">
                              Hãy thử đổi trạng thái thanh toán, chọn chuyến khác hoặc xóa từ khóa tìm kiếm.
                            </p>
                          </div>
                        )}
                      </section>
                    ) : (
                      <section aria-label="Danh sách tra cứu vé" className="space-y-4">
                        <p role="status" className="text-sm text-[#5C636A]">
                          Tìm thấy {data.totalTickets} vé theo bộ lọc hiện tại · Trang{" "}
                          {data.page}/{Math.max(1, data.totalPages)}
                        </p>

                        {data.tickets.length > 0 ? (
                          <div
                            role="region"
                            aria-label="Bảng tra cứu vé theo chuyến và khách"
                            tabIndex={0}
                            className="relative overflow-x-auto rounded-[6px] border border-[#E0E0E0] bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
                          >
                            <table className="w-full min-w-[640px] border-collapse text-sm">
                              <caption className="sr-only">
                                Bảng tra cứu vé hành khách tách biệt trạng thái thanh toán và trạng thái điểm danh lên xe
                              </caption>
                              <thead className="border-b border-[#E0E0E0] bg-[#F8F9FA] text-left">
                                <tr>
                                  <th scope="col" className="px-3 py-3 font-semibold">
                                    Ghế & hành khách
                                  </th>
                                  <th scope="col" className="px-3 py-3 font-semibold">
                                    Hóa đơn & chuyến
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                                    Đơn giá
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-center font-semibold">
                                    Trạng thái vé
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-center font-semibold">
                                    Điểm danh
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                                    Thao tác
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#E0E0E0]">
                                {data.tickets.map((ticket) => {
                                  const parentInvoice = data.invoices.find(
                                    (inv) => inv.invoiceId === ticket.invoiceId,
                                  );
                                  return (
                                    <tr key={ticket.detailId}>
                                      <th
                                        scope="row"
                                        className="px-3 py-3 text-left font-normal"
                                      >
                                        <p className="font-semibold">
                                          <span className="font-mono font-bold text-[#186734]">
                                            {ticket.seatName}
                                          </span>{" "}
                                          · {ticket.passengerName}
                                        </p>
                                        <p className="mt-0.5 font-mono text-xs text-[#5C636A]">
                                          Chi tiết vé #{ticket.detailId}
                                          {ticket.passengerPhone ? ` · ${ticket.passengerPhone}` : ""}
                                        </p>
                                      </th>
                                      <td className="px-3 py-3">
                                        <p className="font-mono text-xs font-semibold">
                                          #{ticket.invoiceId}
                                          {ticket.paymentCode ? ` (${ticket.paymentCode})` : ""} ·{" "}
                                          <span className="font-sans font-normal text-[#5C636A]">
                                            {ticket.customerName}
                                          </span>
                                        </p>
                                        <p className="mt-0.5 text-xs font-semibold text-[#212529]">
                                          {ticket.tripName}
                                        </p>
                                        <p className="mt-0.5 text-xs text-[#5C636A]">
                                          {ticket.pickupName ? `${ticket.pickupName} · ` : ""}
                                          {formatVietnamDateTime(
                                            ticket.pickupAt ?? ticket.departureAt,
                                            dateOptions,
                                          )}
                                        </p>
                                      </td>
                                      <td className="px-3 py-3 text-right font-mono font-semibold whitespace-nowrap">
                                        {ticket.unitPrice ? formatVnd(ticket.unitPrice) : "—"}
                                      </td>
                                      <td className="px-3 py-3 text-center">
                                        <TicketStatusBadge status={ticket.status} />
                                      </td>
                                      <td className="px-3 py-3 text-center">
                                        <CheckInStatusBadge status={ticket.checkInStatus} />
                                      </td>
                                      <td className="px-3 py-3 text-right">
                                        {parentInvoice || source?.readInvoiceDetail ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              openInvoiceDetail(
                                                ticket.invoiceId,
                                                parentInvoice ?? null,
                                              )
                                            }
                                            className="min-h-11 whitespace-nowrap font-semibold text-[#186734] underline underline-offset-4"
                                          >
                                            Mở #{ticket.invoiceId}
                                          </button>
                                        ) : (
                                          <span className="font-mono text-xs text-[#5C636A]">
                                            #{ticket.invoiceId}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="space-y-3 rounded-[6px] border border-[#E0E0E0] bg-white py-10 text-center">
                            <Ticket
                              aria-hidden="true"
                              className="mx-auto size-9 text-[#5C636A]"
                            />
                            <h2 className="font-bold">Không tìm thấy vé khớp bộ lọc</h2>
                            <p className="text-sm text-[#5C636A]">
                              Bạn có thể đổi trạng thái vé, trạng thái điểm danh hoặc chọn chuyến khởi hành khác.
                            </p>
                          </div>
                        )}
                      </section>
                    )}

                    {data.totalPages > 1 && (
                      <nav
                        aria-label="Phân trang hóa đơn và vé"
                        className="flex flex-wrap items-center justify-between gap-3 print:hidden"
                      >
                        <button
                          type="button"
                          disabled={query.page <= 1}
                          onClick={() =>
                            setQuery((prev) => ({ ...prev, page: prev.page - 1 }))
                          }
                          className={secondaryButtonClass}
                        >
                          Trang trước
                        </button>
                        <p className="text-sm">
                          Trang {data.page}/{data.totalPages}
                        </p>
                        <button
                          type="button"
                          disabled={query.page >= data.totalPages}
                          onClick={() =>
                            setQuery((prev) => ({ ...prev, page: prev.page + 1 }))
                          }
                          className={secondaryButtonClass}
                        >
                          Trang sau
                        </button>
                      </nav>
                    )}
                  </>
                )}
              </>
            )}

            {/* TAB 3: CUSTOMER BOOKING & TICKET HISTORY (Connected to /api/staff/customers) */}
            {activeTab === "customers" && (
              <section aria-label="Tra cứu hóa đơn và vé theo khách hàng" className="space-y-6">
                <form
                  onSubmit={handleCustomerFilterSubmit}
                  className="grid items-stretch gap-4 rounded-[6px] border border-[#E0E0E0] bg-white p-4 sm:grid-cols-[minmax(0,1fr)_auto] print:hidden"
                >
                  <div className="flex min-w-0 flex-col justify-between gap-1.5">
                    <label htmlFor="customer-lookup-q" className="text-sm font-semibold">
                      Tìm khách hàng theo họ tên, email hoặc số điện thoại
                    </label>
                    <input
                      id="customer-lookup-q"
                      type="search"
                      value={customerSearchDraft}
                      maxLength={100}
                      placeholder="Ví dụ: Trần Khách, 0901234567…"
                      onChange={(e) => setCustomerSearchDraft(e.target.value)}
                      className={`${controlClass} w-full`}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className={
                        hasOpenModal ? brandButtonClass : primaryYellowButtonClass
                      }
                    >
                      <Search aria-hidden="true" className="size-4" />
                      Tìm khách hàng
                    </button>
                  </div>
                </form>

                {customerPageState.status === "loading" && (
                  <p role="status" className="py-10 text-center text-sm text-[#5C636A]">
                    Đang tải danh sách khách hàng…
                  </p>
                )}

                {customerPageState.status === "error" && (
                  <div
                    role="alert"
                    className="space-y-3 rounded-[6px] border border-[#E0E0E0] bg-white p-8 text-center"
                  >
                    <p className="text-sm font-semibold text-[#C62828]">
                      Không thể tải danh bạ khách hàng lúc này.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCustomerAppliedQuery((prev) => ({ ...prev }))}
                      className={secondaryButtonClass}
                    >
                      Thử tải lại
                    </button>
                  </div>
                )}

                {customerPageState.status === "ready" && customerPageState.data && (
                  <div className="space-y-6">
                    {customerPageState.data.items.length > 0 ? (
                      <div
                        role="region"
                        aria-label="Danh sách khách hàng"
                        tabIndex={0}
                        className="relative overflow-x-auto rounded-[6px] border border-[#E0E0E0] bg-white"
                      >
                        <table className="w-full min-w-[600px] border-collapse text-sm">
                          <caption className="sr-only">
                            Danh sách khách hàng và số lượng hóa đơn trong phạm vi phụ trách
                          </caption>
                          <thead className="border-b border-[#E0E0E0] bg-[#F8F9FA] text-left">
                            <tr>
                              <th scope="col" className="px-3 py-3 font-semibold">
                                Khách hàng
                              </th>
                              <th scope="col" className="px-3 py-3 font-semibold">
                                Liên hệ
                              </th>
                              <th scope="col" className="px-3 py-3 text-right font-semibold">
                                Số hóa đơn
                              </th>
                              <th scope="col" className="px-3 py-3 font-semibold">
                                Đặt vé gần nhất
                              </th>
                              <th scope="col" className="px-3 py-3 text-right font-semibold">
                                Lịch sử hóa đơn & vé
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E0E0E0]">
                            {customerPageState.data.items.map((cust) => (
                              <tr key={cust.user_id}>
                                <th scope="row" className="px-3 py-3 text-left font-semibold">
                                  {cust.full_name}{" "}
                                  <span className="font-mono text-xs text-[#5C636A]">
                                    (#{cust.user_id})
                                  </span>
                                </th>
                                <td className="px-3 py-3 text-xs text-[#5C636A]">
                                  <p className="font-medium text-[#212529]">{cust.phone}</p>
                                  <p className="break-all">{cust.email}</p>
                                </td>
                                <td className="px-3 py-3 text-right font-mono font-semibold">
                                  {cust.invoice_count}
                                </td>
                                <td className="px-3 py-3 text-xs text-[#5C636A]">
                                  {cust.last_booking_at
                                    ? formatVietnamDateTime(cust.last_booking_at, dateOptions)
                                    : "Chưa có"}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedCustomerId(cust.user_id)}
                                    className="min-h-11 font-semibold text-[#186734] underline underline-offset-4"
                                  >
                                    Xem các hóa đơn & vé
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="space-y-3 rounded-[6px] border border-[#E0E0E0] bg-white py-10 text-center">
                        <Users aria-hidden="true" className="mx-auto size-9 text-[#5C636A]" />
                        <h2 className="font-bold">Không tìm thấy khách hàng phù hợp</h2>
                        <p className="text-sm text-[#5C636A]">
                          Hãy kiểm tra lại từ khóa hoặc phạm vi hóa đơn bạn đang phụ trách.
                        </p>
                      </div>
                    )}

                    {/* Selected Customer Bookings */}
                    {selectedCustomerId && (
                      <div className="space-y-4 rounded-[6px] border border-[#E0E0E0] bg-white p-4 sm:p-6">
                        {customerDetailState.status === "loading" && (
                          <p role="status" className="py-6 text-center text-sm text-[#5C636A]">
                            Đang tải lịch sử hóa đơn và vé của khách hàng #{selectedCustomerId}…
                          </p>
                        )}

                        {customerDetailState.status === "error" && (
                          <p role="alert" className="py-6 text-center text-sm text-[#C62828]">
                            Không thể tải lịch sử hóa đơn của khách hàng này.
                          </p>
                        )}

                        {customerDetailState.status === "ready" &&
                          customerDetailState.detail &&
                          customerDetailState.invoices && (
                            <>
                              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E0E0E0] pb-3">
                                <div>
                                  <h3 className="text-lg font-bold">
                                    Hóa đơn và vé của khách:{" "}
                                    {customerDetailState.detail.customer.full_name}
                                  </h3>
                                  <p className="mt-0.5 text-xs text-[#5C636A]">
                                    {customerDetailState.detail.customer.phone} ·{" "}
                                    {customerDetailState.detail.customer.email}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedCustomerId(null)}
                                  className={secondaryButtonClass}
                                >
                                  Đóng lịch sử khách
                                </button>
                              </div>

                              {customerDetailState.invoices.length > 0 ? (
                                <div className="relative overflow-x-auto rounded-[6px] border border-[#E0E0E0]">
                                  <table className="w-full min-w-[600px] border-collapse text-sm">
                                    <thead className="border-b border-[#E0E0E0] bg-[#F8F9FA] text-left">
                                      <tr>
                                        <th scope="col" className="px-3 py-3 font-semibold">
                                          Số hóa đơn
                                        </th>
                                        <th scope="col" className="px-3 py-3 font-semibold">
                                          Chuyến khởi hành
                                        </th>
                                        <th scope="col" className="px-3 py-3 font-semibold">
                                          Nhân viên phụ trách (Snapshot)
                                        </th>
                                        <th
                                          scope="col"
                                          className="px-3 py-3 text-right font-semibold"
                                        >
                                          Tổng tiền
                                        </th>
                                        <th
                                          scope="col"
                                          className="px-3 py-3 text-center font-semibold"
                                        >
                                          Trạng thái thanh toán
                                        </th>
                                        <th
                                          scope="col"
                                          className="px-3 py-3 text-right font-semibold"
                                        >
                                          Chi tiết vé & in
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#E0E0E0]">
                                      {customerDetailState.invoices.map((inv) => {
                                        const snap = formatResponsibleStaffSnapshot(inv);
                                        return (
                                          <tr key={inv.invoiceId}>
                                            <th
                                              scope="row"
                                              className="px-3 py-3 text-left font-mono font-bold"
                                            >
                                              #{inv.invoiceId}
                                            </th>
                                            <td className="px-3 py-3">
                                              <p className="font-semibold">{inv.tripName}</p>
                                              <p className="text-xs text-[#5C636A]">
                                                {formatVietnamDateTime(
                                                  inv.departureAt,
                                                  dateOptions,
                                                )}
                                              </p>
                                            </td>
                                            <td className="px-3 py-3">
                                              <p className="font-medium">{snap.nameLabel}</p>
                                              {snap.roleLabel && (
                                                <p className="text-xs text-[#5C636A]">
                                                  {snap.roleLabel}
                                                </p>
                                              )}
                                            </td>
                                            <td className="px-3 py-3 text-right font-mono font-semibold whitespace-nowrap">
                                              {formatVnd(inv.totalAmount)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                              <InvoiceStatusBadge status={inv.status} />
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                              <button
                                                type="button"
                                                onClick={() => openInvoiceDetail(inv.invoiceId, inv)}
                                                className="min-h-11 font-semibold text-[#186734] underline underline-offset-4"
                                              >
                                                Chi tiết ({inv.tickets.length} vé)
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="py-6 text-center text-sm text-[#5C636A]">
                                  Khách hàng này chưa có hóa đơn nào trong phạm vi hiển thị.
                                </p>
                              )}
                            </>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}

      {/* Invoice Detail & Print Dialog */}
      {selectedModal && (
        <InvoiceDetailDialog
          key={`${read.identityKey}:${selectedModal.invoiceId}`}
          invoice={
            detailState?.invoiceId === selectedModal.invoiceId && detailState.status === "ready"
              ? (detailState.invoice ?? selectedModal.preview)
              : selectedModal.preview
          }
          loading={isDetailLoading}
          error={
            !isDetailLoading &&
            detailState?.invoiceId === selectedModal.invoiceId &&
            detailState.status === "error"
              ? (detailState.errorMessage ?? "Không thể tải chi tiết hóa đơn.")
              : null
          }
          onRetry={() => setDetailRevision((value) => value + 1)}
          onClose={() => {
            setDetailState(null);
            setSelectedModal(null);
          }}
          onSelectDeparture={(depId) => {
            setActiveTab("invoices");
            handleJumpToDeparture(depId);
          }}
          onSelectCustomer={handleJumpToCustomer}
        />
      )}
    </div>
  );
}
