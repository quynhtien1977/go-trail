"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { InvoiceDto } from "@/schemas/invoice";
import { BookingClientError, fetchInvoice } from "@/lib/booking-client";
import { formatVietnamDateTime, formatVnd } from "@/lib/catalog-client";
import { remainingInvoiceSeconds } from "@/lib/booking-presentation";

const invoiceLabels = { Pending: "Chờ thanh toán", Paid: "Đã thanh toán", Expired: "Đã hết hạn", Cancelled: "Đơn không còn hiệu lực" };
const dateOptions: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };

export function InvoicePayment({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const validId = /^[1-9]\d*$/.test(invoiceId) && Number(invoiceId) <= 2147483647;
  const [snapshot, setSnapshot] = useState<{ invoice: InvoiceDto; startedAt: number } | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(validId);
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  const [qrFailed, setQrFailed] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");

  useEffect(() => {
    if (!validId) return;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    async function refresh() {
      let again = true;
      const startedAt = performance.now();
      try {
        const invoice = await fetchInvoice(Number(invoiceId), controller.signal);
        if (controller.signal.aborted) return;
        setSnapshot({ invoice, startedAt });
        setSeconds(remainingInvoiceSeconds(invoice, performance.now() - startedAt));
        setError(null);
        again = invoice.status === "Pending" || invoice.status === "Expired";
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (cause instanceof BookingClientError && [401, 403, 404].includes(cause.status)) {
          setSnapshot(null);
          again = false;
          if (cause.status === 401) {
            router.replace(`/login?callbackUrl=${encodeURIComponent(`/checkout/invoices/${invoiceId}`)}`);
            setError({ message: "Vui lòng đăng nhập để xem hóa đơn.", retry: false });
          } else {
            setError({ message: "Không tìm thấy hóa đơn hoặc bạn không có quyền xem.", retry: false });
          }
        } else {
          setError({ message: "Không thể cập nhật hóa đơn. Vui lòng kiểm tra kết nối và thử lại trước khi chuyển khoản.", retry: true });
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (again) timeout = setTimeout(refresh, 5000);
        }
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [invoiceId, validId, revision, router]);

  useEffect(() => {
    if (!snapshot) return;
    const tick = () => setSeconds(remainingInvoiceSeconds(snapshot.invoice, performance.now() - snapshot.startedAt));
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [snapshot]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice("Đã sao chép.");
    } catch { setCopyNotice("Không sao chép được. Vui lòng chọn và sao chép thông tin bên dưới."); }
  }

  const invoice = snapshot?.invoice;
  const payable = !error && !loading && invoice?.status === "Pending" && seconds > 0 && invoice.payment.status === "Ready";

  return (
    <div className="space-y-6">
      <Link href="/account" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#186734] underline underline-offset-4">← Tài khoản của tôi</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-[#186734]">Go-Trail · Hóa đơn đặt vé</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Thông tin thanh toán</h1>
          <p className="mt-2 text-sm text-[#5C636A]">Kiểm tra hóa đơn và chuyển khoản đúng thông tin bên dưới.</p>
        </div>
        {validId && <button type="button" disabled={loading}
          onClick={() => { setLoading(true); setQrFailed(false); setCopyNotice(""); setRevision(value => value + 1); }}
          className="min-h-11 rounded-[5px] border border-[#6B7280] bg-white px-4 text-sm font-semibold disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2">{loading ? "Đang cập nhật…" : "Cập nhật trạng thái"}</button>}
      </div>

      {!validId && <p role="alert">Mã hóa đơn không hợp lệ. Vui lòng kiểm tra lại liên kết.</p>}
      {loading && !invoice && <p role="status" className="py-12 text-center text-[#5C636A]">Đang tải hóa đơn…</p>}
      {error && <p role="alert" className="border-l-4 border-[#C62828] bg-white p-4 text-sm text-[#C62828]">{error.message}</p>}

      {invoice && (
        <>
          <div role="status" className={`border-l-4 bg-white p-4 ${invoice.status === "Paid" ? "border-[#186734]" : "border-[#8A5A00]"}`}>
            <p className="font-bold">{invoiceLabels[invoice.status]}</p>
            {invoice.status === "Paid" ? <p className="mt-1 text-sm">Hệ thống đã xác nhận thanh toán cho hóa đơn này.</p> :
              invoice.status === "Pending" && seconds === 0 ? <p className="mt-1 text-sm">Thời gian giữ ghế đã kết thúc. Vui lòng không chuyển khoản; đang chờ hệ thống cập nhật trạng thái.</p> :
              invoice.status === "Expired" || invoice.status === "Cancelled" ? <p className="mt-1 text-sm">Hóa đơn không còn trong thời gian thanh toán. Nếu đã chuyển khoản, vui lòng liên hệ Go-Trail để được kiểm tra.</p> :
              <p className="mt-1 text-sm">Hóa đơn chỉ được xác nhận khi hệ thống ghi nhận thanh toán.</p>}
          </div>

          {invoice.status === "Paid" && <Link href="/account/tickets" className="inline-flex min-h-11 items-center rounded-[5px] bg-[#186734] px-4 text-sm font-bold text-white">Xem vé của tôi</Link>}

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <section aria-labelledby="invoice-details" className="min-w-0 rounded-[8px] border border-neutral-300 bg-white p-4 sm:p-6">
              <h2 id="invoice-details" className="text-lg font-bold">Hóa đơn #{invoice.invoice_id}</h2>
              <h3 className="mt-4 text-lg font-semibold">{invoice.departure.trip_name}</h3>
              <p className="mt-1 text-sm text-[#5C636A]">Khởi hành: {formatVietnamDateTime(invoice.departure.departure_date, dateOptions)}</p>
              <dl className="mt-5 divide-y divide-neutral-200 text-sm">
                <div className="py-3"><dt className="text-[#5C636A]">Người mua</dt><dd className="mt-1 font-semibold break-words">{invoice.customer_name}</dd></div>
                <div className="py-3"><dt className="text-[#5C636A]">Ngày lập</dt><dd className="mt-1">{formatVietnamDateTime(invoice.created_at, dateOptions)}</dd></div>
                <div className="py-3"><dt className="text-[#5C636A]">Nhân viên phụ trách hóa đơn</dt><dd className="mt-1 font-semibold break-words">{invoice.responsible_name_snapshot ?? "Chưa có thông tin"}</dd>
                  {invoice.responsible_role_snapshot && <dd className="mt-1 text-xs text-[#5C636A]">{invoice.responsible_role_snapshot === "RouteMgr" ? "Quản lý tuyến" : invoice.responsible_role_snapshot === "Admin" ? "Quản trị viên" : invoice.responsible_role_snapshot}</dd>}</div>
                <div className="flex flex-wrap justify-between gap-2 py-4"><dt className="font-bold">Tổng thanh toán</dt><dd className="text-xl font-bold text-[#186734]">{formatVnd(invoice.total_amount)}</dd></div>
              </dl>
              <h3 className="border-t border-neutral-200 pt-4 font-bold">Hành khách và điểm đón</h3>
              {invoice.tickets.length === 0 && <p className="mt-3 text-sm text-[#5C636A]">Chưa có thông tin hành khách trong hóa đơn.</p>}
              <ul className="divide-y divide-neutral-200">
                {invoice.tickets.map(ticket => (
                  <li key={ticket.detail_id} className="space-y-1 py-4 text-sm break-words">
                    <p className="font-semibold">Ghế {ticket.seat_name} · {ticket.passenger_name}</p>
                    <p>{ticket.pickup_name}</p><p className="text-[#5C636A]">{ticket.pickup_address}</p>
                    <p>Giờ đón: {formatVietnamDateTime(ticket.pickup_time, dateOptions)}</p>
                    <p>{formatVnd(ticket.unit_price)} · {ticket.status === "Valid" ? "Vé hợp lệ" : ticket.status === "Pending" ? "Chờ thanh toán" : "Vé không còn hiệu lực"}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="payment-instructions" className="min-w-0 rounded-[8px] border border-neutral-300 bg-white p-4 sm:p-6">
              <h2 id="payment-instructions" className="text-lg font-bold">Thanh toán chuyển khoản</h2>
              <p className="mt-3 text-sm">Vé đã mua không hủy, không hoàn và không chuyển chuyến. Đóng trang này không hủy vé đã thanh toán.</p>
              {invoice.status === "Pending" && seconds > 0 && <div className="my-5 border-y border-neutral-200 py-4">
                <p className="text-sm text-[#5C636A]">Thời gian giữ ghế còn lại</p>
                <p role="timer" aria-live="off" aria-label="Thời gian giữ ghế còn lại" className="mt-1 font-mono text-3xl font-bold text-[#8A5A00]">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</p>
                <p className="mt-2 text-xs text-[#5C636A]">Hạn thanh toán: {formatVietnamDateTime(invoice.expires_at, dateOptions)}</p>
              </div>}
              {payable && invoice.payment.status === "Ready" ? (
                <>
                  <div className="my-5 flex min-h-48 items-center justify-center">
                    {qrFailed ? <p role="alert" className="text-center text-sm text-[#5C636A]">Không tải được mã QR. Bạn có thể dùng thông tin chuyển khoản bên dưới hoặc cập nhật để thử lại.</p> :
                      // Public payment URL comes from the existing invoice contract.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={invoice.payment.qr_url} alt="Mã VietQR thanh toán hóa đơn" width={280} height={350} referrerPolicy="no-referrer" className="h-auto max-w-full" onError={() => setQrFailed(true)} />}
                  </div>
                  <dl className="space-y-4 text-sm">
                    <div><dt className="text-[#5C636A]">Ngân hàng</dt><dd className="mt-1 font-semibold break-all">{invoice.payment.bank_id}</dd></div>
                    <div><dt className="text-[#5C636A]">Chủ tài khoản</dt><dd className="mt-1 font-semibold break-words">{invoice.payment.account_name}</dd></div>
                    <div><dt className="text-[#5C636A]">Số tài khoản</dt><dd className="flex flex-wrap items-center justify-between gap-2"><span className="select-all font-mono font-semibold break-all">{invoice.payment.account_number}</span><button type="button" onClick={() => void copy(invoice.payment.status === "Ready" ? invoice.payment.account_number : "")} className="min-h-11 text-[#186734] underline underline-offset-4">Sao chép số tài khoản</button></dd></div>
                    <div><dt className="text-[#5C636A]">Số tiền chuyển khoản</dt><dd className="mt-1 text-lg font-bold">{formatVnd(invoice.payment.amount)}</dd></div>
                    <div><dt className="text-[#5C636A]">Nội dung chuyển khoản (giữ nguyên)</dt><dd className="flex flex-wrap items-center justify-between gap-2"><span className="select-all font-mono font-bold break-all">{invoice.payment.transfer_content}</span><button type="button" onClick={() => void copy(invoice.payment.status === "Ready" ? invoice.payment.transfer_content : "")} className="min-h-11 text-[#186734] underline underline-offset-4">Sao chép nội dung</button></dd></div>
                  </dl>
                  <p role="status" className="mt-3 text-sm text-[#186734]">{copyNotice}</p>
                  <p className="mt-4 text-sm text-[#5C636A]">Chuyển đúng số tiền và nội dung. Trang sẽ tự cập nhật khi hệ thống xác nhận; vui lòng không chuyển khoản lần nữa khi đang chờ.</p>
                </>
              ) : invoice.status === "Pending" && seconds > 0 && !error && !loading ? (
                <p className="mt-5 text-sm text-[#5C636A]">Thông tin chuyển khoản chưa sẵn sàng. Vui lòng cập nhật trạng thái hoặc liên hệ Go-Trail để được hỗ trợ.</p>
              ) : null}
              <a href="tel:0972699242" className="mt-6 inline-flex min-h-11 items-center rounded-[5px] border border-[#186734] px-4 text-sm font-semibold text-[#186734]">Liên hệ Go-Trail: 0972 699 242</a>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
