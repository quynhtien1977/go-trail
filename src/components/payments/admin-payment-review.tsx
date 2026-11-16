"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ClipboardCheck, Search } from "lucide-react";
import { formatVnd, formatVietnamDateTime } from "@/lib/catalog-client";
import { privateReadScope, type PaymentReviewView, type PrivatePageSource } from "@/lib/payment-ui";
import { usePrivatePage } from "./use-private-page";
import { PrivateReadNotice } from "./private-read-notice";
import { PaymentDetailsDialog } from "./payment-details-dialog";

const control = "min-h-11 rounded-[5px] border border-[#6B7280] bg-white px-3 text-sm disabled:bg-neutral-100 disabled:text-[#5C636A]";
const dateOptions: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };

function PaymentStatus({ status }: { status: PaymentReviewView["status"] }) {
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-1 text-xs font-semibold ${status === "NeedsReview" ? "bg-[#FFF8E1] text-[#8A5A00]" : "bg-[#E8F5E9] text-[#186734]"}`}>{status === "NeedsReview" ? "Chờ đối soát" : "Đã ghi nhận"}</span>;
}

export function AdminPaymentReview({ source }: { source?: PrivatePageSource<PaymentReviewView> }) {
  const session = useSession();
  const identity = privateReadScope("payments", session.status, session.data?.user);
  return <AdminPaymentWorkspace key={`${session.status}:${identity}`} source={source} />;
}

function AdminPaymentWorkspace({ source }: { source?: PrivatePageSource<PaymentReviewView> }) {
  const [params, setParams] = useState({ page: 1, filter: "NeedsReview", query: "" });
  const [filterDraft, setFilterDraft] = useState("NeedsReview");
  const [queryDraft, setQueryDraft] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const read = usePrivatePage("payments", source, params);
  if (read.data && params.page > Math.max(1, read.data.totalPages)) {
    setParams(current => ({ ...current, page: Math.max(1, read.data!.totalPages) }));
    setSelectedId(null);
  }
  const selected = read.data?.items.find(item => item.id === selectedId);
  const canFilter = !!source && (read.phase === "ready" || read.phase === "error");
  function filter(event: FormEvent) {
    event.preventDefault();
    if (!canFilter) return;
    setSelectedId(null);
    setParams({ page: 1, filter: filterDraft, query: queryDraft.trim() });
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#186734]">Theo dõi giao dịch</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Đối soát thanh toán</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C636A]">Kiểm tra giao dịch cần đối soát và hóa đơn liên quan. Trạng thái, số tiền và lý do được lấy từ dữ liệu hệ thống.</p></div><button type="button" disabled={!source || read.phase !== "ready"} onClick={read.refresh} className={control}>Cập nhật giao dịch</button></div>
    <p className="border-l-4 border-neutral-400 bg-white p-4 text-sm leading-6 text-[#5C636A]">Màn hình này dùng để xem thông tin. Không xác nhận thanh toán, sửa tiền hoặc hoàn tiền tại đây; các giao dịch chưa được xử lý hợp lệ tiếp tục chờ đối soát.</p>
    <form onSubmit={filter} className="grid gap-4 border-y border-neutral-300 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(180px,auto)_auto]">
      <div className="min-w-0"><label htmlFor="payment-query" className="text-sm font-semibold">Tìm giao dịch hoặc mã thanh toán</label><input id="payment-query" value={queryDraft} maxLength={100} disabled={!canFilter} onChange={event => setQueryDraft(event.target.value)} className={`${control} mt-1 w-full`} /></div>
      <div><label htmlFor="payment-filter" className="text-sm font-semibold">Trạng thái</label><select id="payment-filter" value={filterDraft} disabled={!canFilter} onChange={event => setFilterDraft(event.target.value)} className={`${control} mt-1 w-full`}><option value="NeedsReview">Chờ đối soát</option><option value="Success">Đã ghi nhận</option><option value="all">Tất cả</option></select></div>
      <button type="submit" disabled={!canFilter} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-[5px] bg-[#FEBB02] px-4 text-sm font-bold text-black disabled:bg-neutral-200 disabled:text-[#5C636A]"><Search aria-hidden="true" className="size-4" />Áp dụng bộ lọc</button>
    </form>
    <PrivateReadNotice phase={read.phase} kind="payments" onRetry={read.refresh} />
    {read.data && <>
      <p role="status" className="text-sm text-[#5C636A]">{read.data.totalItems} giao dịch theo bộ lọc · không tự tính doanh thu từ danh sách này</p>
      {read.data.items.length ? <div role="region" aria-label="Danh sách giao dịch đối soát" tabIndex={0} className="relative overflow-x-auto rounded-[6px] border border-neutral-300 bg-white focus-visible:outline-2 focus-visible:outline-offset-2"><table className="w-full min-w-[660px] border-collapse text-sm"><caption className="sr-only">Danh sách giao dịch và trạng thái đối soát do hệ thống cung cấp</caption><thead className="border-b border-neutral-300 bg-[#F8F9FA] text-left"><tr><th scope="col" className="px-4 py-3 font-semibold">Giao dịch</th><th scope="col" className="px-4 py-3 font-semibold">Hóa đơn</th><th scope="col" className="px-4 py-3 text-right font-semibold">Số tiền nhận</th><th scope="col" className="px-4 py-3 text-center font-semibold">Trạng thái</th><th scope="col" className="px-4 py-3"><span className="sr-only">Chi tiết</span></th></tr></thead><tbody className="divide-y divide-neutral-200">{read.data.items.map(payment => <tr key={payment.id}><th scope="row" className="max-w-64 px-4 py-3 text-left font-normal"><p className="font-mono font-semibold break-all">{payment.transactionReference}</p><p className="mt-1 text-xs text-[#5C636A]">{formatVietnamDateTime(payment.receivedAt, dateOptions)}</p></th><td className="px-4 py-3">{payment.invoice ? <><p className="font-mono font-semibold">#{payment.invoice.id}</p><p className="mt-1 text-xs break-all">{payment.invoice.paymentCode}</p></> : <span className="text-[#5C636A]">Chưa khớp hóa đơn</span>}</td><td className="px-4 py-3 text-right font-mono font-semibold whitespace-nowrap">{formatVnd(payment.receivedAmount)}</td><td className="px-4 py-3 text-center"><PaymentStatus status={payment.status} /></td><td className="px-4 py-3"><button type="button" onClick={() => setSelectedId(payment.id)} aria-label={`Xem giao dịch ${payment.transactionReference}`} className="min-h-11 whitespace-nowrap font-semibold text-[#186734] underline underline-offset-4">Chi tiết</button></td></tr>)}</tbody></table></div> : <div className="space-y-3 py-10 text-center"><ClipboardCheck aria-hidden="true" className="mx-auto size-9 text-[#5C636A]" /><h2 className="font-bold">Không có giao dịch khớp bộ lọc</h2><p className="text-sm text-[#5C636A]">Bạn có thể thay đổi trạng thái hoặc từ khóa để kiểm tra danh sách khác.</p></div>}
      {read.data.totalPages > 1 && <nav aria-label="Phân trang giao dịch" className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={params.page <= 1} onClick={() => setParams(current => ({ ...current, page: current.page - 1 }))} className={control}>Trang trước</button><p className="text-sm">Trang {read.data.page}/{read.data.totalPages}</p><button type="button" disabled={params.page >= read.data.totalPages} onClick={() => setParams(current => ({ ...current, page: current.page + 1 }))} className={control}>Trang sau</button></nav>}
    </>}
    {selected && <PaymentDetailsDialog key={`${read.identityKey}:${selected.id}`} title="Chi tiết giao dịch" onClose={() => setSelectedId(null)}>
      <PaymentStatus status={selected.status} /><dl className="mt-4 divide-y divide-neutral-200 text-sm">{[["Mã giao dịch", selected.transactionReference], ["Thời điểm nhận", formatVietnamDateTime(selected.receivedAt, dateOptions)], ["Số tiền nhận", formatVnd(selected.receivedAmount)], ["Lý do cần kiểm tra", selected.reason ?? "Chưa có lý do chi tiết"]].map(([label, value]) => <div key={label} className="py-3"><dt className="text-[#5C636A]">{label}</dt><dd className="mt-1 font-semibold break-words">{value}</dd></div>)}</dl>
      <h3 className="mt-5 border-t border-neutral-300 pt-4 font-bold">Hóa đơn liên quan</h3>
      {selected.invoice ? <><dl className="mt-3 space-y-3 text-sm">{[["Số hóa đơn", `#${selected.invoice.id}`], ["Mã thanh toán", selected.invoice.paymentCode], ["Tuyến", selected.invoice.tripName], ["Tổng hóa đơn", formatVnd(selected.invoice.totalAmount)], ["Trạng thái hóa đơn", { Pending: "Chờ thanh toán", Paid: "Đã thanh toán", Expired: "Hết hạn", Cancelled: "Không còn hiệu lực" }[selected.invoice.status]], ["Nhân viên phụ trách hóa đơn", selected.invoice.responsibleName ?? "Chưa có thông tin"]].map(([label, value]) => <div key={label}><dt className="text-[#5C636A]">{label}</dt><dd className="mt-1 font-semibold break-words">{value}</dd></div>)}</dl><Link href={`/checkout/invoices/${selected.invoice.id}`} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[#186734] underline underline-offset-4">Xem hóa đơn #{selected.invoice.id}</Link></> : <p className="mt-3 text-sm text-[#5C636A]">Hệ thống chưa xác định hóa đơn cho giao dịch này. Không tự gán hoặc xác nhận tiền từ màn hình này.</p>}
      <p className="mt-5 border-t border-neutral-300 pt-4 text-sm text-[#5C636A]">Thông tin chỉ để đối chiếu. Không suy ra giao dịch thành công từ số tiền hoặc trạng thái hóa đơn hiển thị tại đây.</p>
    </PaymentDetailsDialog>}
  </div>;
}
