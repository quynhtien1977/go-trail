"use client";

import { useEffect, useRef } from "react";
import { Printer, X } from "lucide-react";
import { formatVietnamDateTime, formatVnd } from "@/lib/catalog-client";
import {
  describeInvoicePaymentAndCheckIn,
  formatResponsibleStaffSnapshot,
  type ManagedCheckInStatus,
  type ManagedInvoiceStatus,
  type ManagedInvoiceView,
  type ManagedTicketStatus,
  type StatusBadgeTone,
} from "@/lib/invoice-management-ui";

const dateOptions: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function toneClass(tone: StatusBadgeTone): string {
  switch (tone) {
    case "success":
      return "bg-[#E8F5E9] text-[#186734]";
    case "warning":
      return "bg-[#FFF8E1] text-[#8A5A00]";
    case "danger":
      return "bg-[#FFEBEE] text-[#C62828]";
    case "neutral":
    default:
      return "bg-[#F5F5F5] text-[#616161]";
  }
}

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: StatusBadgeTone;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-2 py-1 text-xs font-semibold ${toneClass(
        tone,
      )}`}
    >
      {label}
    </span>
  );
}

export function InvoiceStatusBadge({ status }: { status: ManagedInvoiceStatus }) {
  const desc = describeInvoicePaymentAndCheckIn({
    invoiceStatus: status,
    ticketStatus: "Pending",
    checkInStatus: "Pending",
  });
  return <StatusPill label={desc.invoiceStatusLabel} tone={desc.invoiceStatusTone} />;
}

export function TicketStatusBadge({ status }: { status: ManagedTicketStatus }) {
  const desc = describeInvoicePaymentAndCheckIn({
    invoiceStatus: "Paid",
    ticketStatus: status,
    checkInStatus: "Pending",
  });
  return <StatusPill label={desc.ticketStatusLabel} tone={desc.ticketStatusTone} />;
}

export function CheckInStatusBadge({ status }: { status: ManagedCheckInStatus }) {
  const desc = describeInvoicePaymentAndCheckIn({
    invoiceStatus: "Paid",
    ticketStatus: "Valid",
    checkInStatus: status,
  });
  return <StatusPill label={desc.checkInStatusLabel} tone={desc.checkInStatusTone} />;
}

export function InvoiceDetailDialog({
  invoice,
  loading = false,
  error = null,
  onRetry,
  onClose,
  onSelectDeparture,
  onSelectCustomer,
}: {
  invoice: ManagedInvoiceView | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onClose: () => void;
  onSelectDeparture?: (departureId: number) => void;
  onSelectCustomer?: (customerId: number, customerName: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const snapshot = invoice
    ? formatResponsibleStaffSnapshot(invoice)
    : null;

  useEffect(() => {
    const element = dialogRef.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="invoice-detail-dialog-title"
      onClose={() => {
        if (!dialogRef.current?.open) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%_-_1rem)] max-w-3xl overflow-y-auto rounded-[8px] border border-neutral-300 bg-white p-0 text-[#212529] shadow-xl backdrop:bg-black/60 print:max-h-none print:overflow-visible print:border-0 print:shadow-none"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#E0E0E0] bg-white px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#186734]">Phiếu thông tin hóa đơn và vé</p>
          <h2 id="invoice-detail-dialog-title" className="mt-1 text-lg font-bold sm:text-xl">
            {invoice ? (
              <>
                Hóa đơn #{invoice.invoiceId}
                {invoice.paymentCode ? ` · ${invoice.paymentCode}` : ""}
              </>
            ) : (
              "Chi tiết hóa đơn"
            )}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-2 print:hidden">
          {invoice && (
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden min-h-11 items-center justify-center gap-2 rounded-[5px] bg-[#FEBB02] px-4 text-sm font-bold text-black hover:bg-[#E5A800] sm:inline-flex"
            >
              <Printer aria-hidden="true" className="size-4" />
              In phiếu hóa đơn
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết hóa đơn"
            className="flex size-11 shrink-0 items-center justify-center rounded-[5px] border border-[#6B7280] bg-white text-[#212529] hover:bg-neutral-50"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {!invoice ? (
          loading ? (
            <p role="status" className="py-12 text-center text-sm text-[#5C636A]">
              Đang tải chi tiết hóa đơn và danh sách vé…
            </p>
          ) : (
            <div role="alert" className="space-y-4 py-8 text-center">
              <p className="text-sm font-semibold text-[#C62828]">
                {error ?? "Không thể tải chi tiết hóa đơn lúc này."}
              </p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex min-h-11 items-center justify-center rounded-[5px] border border-[#6B7280] bg-white px-4 text-sm font-semibold text-[#212529] hover:bg-neutral-50"
                >
                  Thử tải lại
                </button>
              )}
            </div>
          )
        ) : (
          <>
        <div className="mb-4 sm:hidden print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[5px] bg-[#FEBB02] px-4 text-sm font-bold text-black hover:bg-[#E5A800]"
          >
            <Printer aria-hidden="true" className="size-4" />
            In phiếu hóa đơn
          </button>
        </div>

        {/* Summary fields */}
      <div className="grid gap-4 border-b border-[#E0E0E0] pb-5 text-sm sm:grid-cols-2">
        <div className="space-y-3">
          <div>
            <p className="text-xs text-[#5C636A]">Trạng thái hóa đơn (Thanh toán)</p>
            <div className="mt-1">
              <InvoiceStatusBadge status={invoice.status} />
            </div>
          </div>

          <div>
            <p className="text-xs text-[#5C636A]">Tổng số tiền hóa đơn</p>
            <p className="mt-1 font-mono text-lg font-bold text-[#212529]">
              {formatVnd(invoice.totalAmount)}
            </p>
          </div>

          <div>
            <p className="text-xs text-[#5C636A]">Ngày lập hóa đơn</p>
            <p className="mt-1 font-semibold">
              {formatVietnamDateTime(invoice.createdAt, dateOptions)}
            </p>
          </div>

          <div>
            <p className="text-xs text-[#5C636A]">Thời hạn giữ ghế ban đầu</p>
            <p className="mt-1 text-[#5C636A]">
              {formatVietnamDateTime(invoice.expiresAt, dateOptions)}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-[#5C636A]">Khách hàng đặt mua</p>
            <p className="mt-1 font-semibold break-words">{invoice.customerName}</p>
            {(invoice.customerPhone || invoice.customerEmail) && (
              <p className="mt-0.5 text-xs text-[#5C636A] break-all">
                {[invoice.customerPhone, invoice.customerEmail].filter(Boolean).join(" · ")}
              </p>
            )}
            {invoice.customerId && onSelectCustomer && (
              <button
                type="button"
                onClick={() => {
                  onSelectCustomer(invoice.customerId!, invoice.customerName);
                  onClose();
                }}
                className="mt-1 text-xs font-semibold text-[#186734] underline underline-offset-4 print:hidden"
              >
                Xem lịch sử đặt vé của khách này
              </button>
            )}
          </div>

          <div>
            <p className="text-xs text-[#5C636A]">Chuyến khởi hành</p>
            <p className="mt-1 font-semibold break-words">
              #{invoice.departureId} · {invoice.tripName}
            </p>
            <p className="mt-0.5 text-xs text-[#5C636A]">
              Khởi hành: {formatVietnamDateTime(invoice.departureAt, dateOptions)}
            </p>
            {onSelectDeparture && (
              <button
                type="button"
                onClick={() => {
                  onSelectDeparture(invoice.departureId);
                  onClose();
                }}
                className="mt-1 text-xs font-semibold text-[#186734] underline underline-offset-4 print:hidden"
              >
                Lọc các hóa đơn cùng chuyến #{invoice.departureId}
              </button>
            )}
          </div>

          <div>
            <p className="text-xs text-[#5C636A]">Nhân viên phụ trách hóa đơn</p>
            <p className="mt-1 font-semibold break-words">{snapshot?.nameLabel}</p>
            {snapshot?.roleLabel && (
              <p className="mt-0.5 text-xs text-[#5C636A]">{snapshot.roleLabel}</p>
            )}
          </div>
        </div>
      </div>

      {/* Responsible staff snapshot & policy notice */}
      <div className="my-4 border-l-4 border-[#186734] bg-[#F8F9FA] p-3 text-xs leading-5 text-[#5C636A]">
        <p>{snapshot?.attributionNote}</p>
        <p className="mt-1">
          Chính sách hiện hành: Vé đã thanh toán không áp dụng hủy hoặc hoàn tiền. Trạng thái thanh toán do hệ thống tự động đối chiếu; không có thao tác xác nhận tiền thủ công hoặc chữ ký duyệt đơn.
        </p>
      </div>

      {/* Tickets table */}
      <div className="space-y-3">
        <h3 className="text-base font-bold">
          Danh sách vé thuộc hóa đơn ({invoice.ticketCount ?? invoice.tickets.length} vé)
        </h3>

        {loading ? (
          <p
            role="status"
            className="rounded-[6px] border border-[#E0E0E0] bg-[#F8F9FA] py-8 text-center text-sm text-[#5C636A]"
          >
            Đang tải danh sách vé và điểm đón…
          </p>
        ) : error ? (
          <div
            role="alert"
            className="space-y-3 rounded-[6px] border border-[#E0E0E0] bg-[#F8F9FA] p-6 text-center"
          >
            <p className="text-sm font-semibold text-[#C62828]">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 items-center justify-center rounded-[5px] border border-[#6B7280] bg-white px-4 text-sm font-semibold text-[#212529] hover:bg-neutral-50"
              >
                Thử tải lại
              </button>
            )}
          </div>
        ) : (
        <div
          role="region"
          aria-label="Danh sách vé trong hóa đơn"
          tabIndex={0}
          className="relative overflow-x-auto rounded-[6px] border border-[#E0E0E0] bg-white"
        >
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <caption className="sr-only">
              Danh sách vé thuộc hóa đơn kèm trạng thái thanh toán và trạng thái điểm danh lên xe
            </caption>
            <thead className="border-b border-[#E0E0E0] bg-[#F8F9FA] text-left">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Ghế
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Hành khách
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Điểm đón
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Đơn giá
                </th>
                <th scope="col" className="px-3 py-2.5 text-center font-semibold">
                  Trạng thái vé
                </th>
                <th scope="col" className="px-3 py-2.5 text-center font-semibold">
                  Điểm danh lên xe
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0E0]">
              {invoice.tickets.map((ticket) => (
                <tr key={ticket.detailId}>
                  <th scope="row" className="px-3 py-2.5 text-left font-mono font-semibold">
                    {ticket.seatName}
                  </th>
                  <td className="px-3 py-2.5 font-medium">{ticket.passengerName}</td>
                  <td className="px-3 py-2.5 text-xs text-[#5C636A]">
                    {ticket.pickupName ? (
                      <>
                        <p className="font-semibold text-[#212529]">{ticket.pickupName}</p>
                        {ticket.pickupAddress && <p>{ticket.pickupAddress}</p>}
                        {ticket.pickupAt && (
                          <p>{formatVietnamDateTime(ticket.pickupAt, dateOptions)}</p>
                        )}
                      </>
                    ) : (
                      <span>Theo lịch đón của chuyến</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap">
                    {ticket.unitPrice ? formatVnd(ticket.unitPrice) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <TicketStatusBadge status={ticket.status} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <CheckInStatusBadge status={ticket.checkInStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
          </>
        )}
      </div>
    </dialog>
  );
}
