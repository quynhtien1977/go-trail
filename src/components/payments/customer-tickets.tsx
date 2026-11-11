"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Ticket, Search } from "lucide-react";
import { formatVnd, formatVietnamDateTime } from "@/lib/catalog-client";
import { invoiceLookupPath, issuedTicketCode, privateReadScope, ticketStatusLabel, type PrivatePageSource, type TicketView } from "@/lib/payment-ui";
import { usePrivatePage } from "./use-private-page";
import { PrivateReadNotice } from "./private-read-notice";
import { PaymentDetailsDialog } from "./payment-details-dialog";
import { TicketQr } from "./ticket-qr";

const control = "min-h-11 rounded-[5px] border border-[#6B7280] bg-white px-3 text-sm disabled:bg-neutral-100 disabled:text-[#5C636A]";
const dateOptions: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };

export function CustomerTickets({ source }: { source?: PrivatePageSource<TicketView> }) {
  const session = useSession();
  const identity = privateReadScope("tickets", session.status, session.data?.user);
  return <CustomerTicketsWorkspace key={`${session.status}:${identity}`} source={source} />;
}

function CustomerTicketsWorkspace({ source }: { source?: PrivatePageSource<TicketView> }) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [lookupError, setLookupError] = useState("");
  const read = usePrivatePage("tickets", source, { page, filter, query: "" });
  if (read.data && page > Math.max(1, read.data.totalPages)) {
    setPage(Math.max(1, read.data.totalPages));
    setSelectedId(null);
  }
  const selected = read.data?.items.find(item => item.id === selectedId);
  const canBrowse = read.phase === "ready";
  const canLookup = !["auth-loading", "sign-in", "forbidden"].includes(read.phase);

  function lookup(event: FormEvent) {
    event.preventDefault();
    if (!canLookup) return;
    const path = invoiceLookupPath(invoiceId);
    if (!path) { setLookupError("Nhập số hóa đơn hợp lệ, ví dụ: 28."); return; }
    setLookupError("");
    router.push(path);
  }

  return <div className="space-y-6 text-[#212529]">
    <Link href="/account" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#186734] underline underline-offset-4">← Tài khoản của tôi</Link>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#186734]">Go-Trail · Chuyến đi của bạn</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Vé của tôi</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[#5C636A]">Xem vé, điểm đón và mã QR đã được hệ thống phát hành. Trạng thái thanh toán được xác nhận trên hóa đơn.</p></div><button type="button" onClick={read.refresh} disabled={!source || !canBrowse} className={control}>Cập nhật vé</button></div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-neutral-300 py-4"><label htmlFor="ticket-filter" className="text-sm font-semibold">Trạng thái vé</label><select id="ticket-filter" value={filter} disabled={!source || read.phase === "loading"} onChange={event => { setFilter(event.target.value); setPage(1); setSelectedId(null); }} className={control}><option value="all">Tất cả</option><option value="valid">Vé hợp lệ</option><option value="pending">Chờ thanh toán / phát hành</option><option value="expired">Hết hạn / không còn hiệu lực</option></select>{read.data && <p className="text-sm text-[#5C636A]">{read.data.totalItems} vé theo bộ lọc</p>}</div>
    <PrivateReadNotice phase={read.phase} kind="tickets" onRetry={read.refresh} />
    {read.data && (read.data.items.length ? <ul className="grid gap-4 md:grid-cols-2">
      {read.data.items.map(ticket => <li key={ticket.id} className="min-w-0 rounded-[8px] border border-neutral-300 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-xs text-[#5C636A]">Vé #{ticket.id}</span><span className={`rounded px-2 py-1 text-xs font-semibold ${issuedTicketCode(ticket) ? "bg-[#E8F5E9] text-[#186734]" : "bg-[#F5F5F5] text-[#616161]"}`}>{ticketStatusLabel(ticket)}</span></div>
        <h2 className="mt-4 text-lg font-bold break-words">{ticket.tripName}</h2><p className="mt-1 text-sm text-[#5C636A]">{formatVietnamDateTime(ticket.departureAt, dateOptions)}</p>
        <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>Hành khách</dt><dd className="text-right font-semibold break-words">{ticket.passengerName}</dd></div><div className="flex justify-between gap-3"><dt>Ghế</dt><dd className="font-semibold">{ticket.seatLabel}</dd></div><div><dt className="text-[#5C636A]">Điểm đón</dt><dd className="mt-1 break-words">{ticket.pickupName}</dd></div><div className="flex justify-between gap-3"><dt>Giá vé</dt><dd className="font-semibold">{formatVnd(ticket.unitPrice)}</dd></div></dl>
        <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => setSelectedId(ticket.id)} className="min-h-11 rounded-[5px] bg-[#186734] px-4 text-sm font-semibold text-white">{issuedTicketCode(ticket) ? "Xem vé QR" : "Xem chi tiết vé"}</button><Link href={`/checkout/invoices/${ticket.invoiceId}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-[#186734] underline underline-offset-4">Xem hóa đơn</Link></div>
      </li>)}
    </ul> : <div className="space-y-3 py-10 text-center"><Ticket aria-hidden="true" className="mx-auto size-9 text-[#5C636A]" /><h2 className="font-bold">{filter === "all" ? "Chưa có vé để hiển thị" : "Chưa có vé khớp bộ lọc"}</h2><p className="text-sm text-[#5C636A]">{filter === "all" ? "Vé sẽ xuất hiện sau khi bạn đặt chuyến và được hệ thống phát hành." : "Bạn có thể chọn trạng thái khác để tìm vé."}</p><Link href="/#system-trailbus" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#186734] underline underline-offset-4">Khám phá chuyến đi</Link></div>)}
    {read.data && read.data.totalPages > 1 && <nav aria-label="Phân trang vé" className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={page <= 1} onClick={() => { setSelectedId(null); setPage(value => value - 1); }} className={control}>Trang trước</button><p className="text-sm">Trang {read.data.page}/{read.data.totalPages}</p><button type="button" disabled={page >= read.data.totalPages} onClick={() => { setSelectedId(null); setPage(value => value + 1); }} className={control}>Trang sau</button></nav>}
    {canLookup && <section aria-labelledby="invoice-lookup-title" className="border-t border-neutral-300 pt-6"><h2 id="invoice-lookup-title" className="text-lg font-bold">Đã có số hóa đơn?</h2><p className="mt-2 text-sm text-[#5C636A]">Mở hóa đơn để xem trạng thái và hướng dẫn thanh toán. Hệ thống sẽ kiểm tra quyền xem hóa đơn của bạn.</p><form onSubmit={lookup} noValidate className="mt-4 flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><label htmlFor="invoice-lookup" className="text-sm font-semibold">Số hóa đơn</label><input id="invoice-lookup" type="text" inputMode="numeric" autoComplete="off" value={invoiceId} onChange={event => setInvoiceId(event.target.value)} aria-invalid={!!lookupError} aria-describedby={lookupError ? "invoice-lookup-error" : undefined} className={`${control} mt-1 w-full`} /></div><button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-[5px] bg-[#FEBB02] px-4 text-sm font-bold text-black"><Search aria-hidden="true" className="size-4" />Xem hóa đơn</button></form>{lookupError && <p id="invoice-lookup-error" role="alert" className="mt-2 text-sm text-[#C62828]">{lookupError}</p>}</section>}
    <p className="border-t border-neutral-300 pt-5 text-sm text-[#5C636A]">Vé đã mua không hủy, không hoàn và không chuyển chuyến. Cần hỗ trợ? <a href="tel:0972699242" className="font-semibold text-[#186734] underline">0972 699 242</a>.</p>
    {selected && <PaymentDetailsDialog key={`${read.identityKey}:${selected.id}`} title={`Vé #${selected.id}`} onClose={() => setSelectedId(null)}>
      <p className="text-lg font-bold break-words">{selected.tripName}</p><p className="mt-1 text-sm text-[#5C636A]">{ticketStatusLabel(selected)}</p><TicketQr ticket={selected} />
      <dl className="divide-y divide-neutral-200 text-sm">{[["Hành khách", selected.passengerName], ["Ghế", selected.seatLabel], ["Khởi hành", formatVietnamDateTime(selected.departureAt, dateOptions)], ["Điểm đón", selected.pickupName], ["Địa chỉ", selected.pickupAddress], ["Giờ đón", formatVietnamDateTime(selected.pickupAt, dateOptions)], ["Nhân viên phụ trách hóa đơn", selected.responsibleName ?? "Chưa có thông tin"]].map(([label, value]) => <div key={label} className="py-3"><dt className="text-[#5C636A]">{label}</dt><dd className="mt-1 font-semibold break-words">{value}</dd></div>)}</dl><Link href={`/checkout/invoices/${selected.invoiceId}`} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[#186734] underline underline-offset-4">Xem hóa đơn #{selected.invoiceId}</Link>
    </PaymentDetailsDialog>}
  </div>;
}
