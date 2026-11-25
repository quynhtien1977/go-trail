"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { ChevronRight, Lock, LockOpen, ReceiptText, RefreshCw, Search, UserRound, Users } from "lucide-react";
import type { CustomerSummaryDto } from "@/schemas/customer";
import { cn } from "@/lib/utils";
import {
  AccountClientError, INVOICE_STATUS_LABELS, INVOICE_STATUS_TONE, customerClient, describeFailure, describeResponsible,
  describeTicket, directoryCapabilities, formatCount, formatDate, formatDateTime, formatVnd, updateAccountAccess,
  type AccountStatus, type CustomerQuery, type Failure,
} from "@/lib/customer-account-ui";
import {
  Avatar, Dialog, Drawer, EmptyBlock, Notice, Pagination, SkeletonRows, Spinner, StatTile, StatusTag, Tag,
  buttonDanger, buttonGreen, buttonOutline, buttonOutlineDanger, buttonOutlineGreen,
} from "./ui-parts";
import { useLoad } from "./use-load";

const input = "h-11 rounded-[5px] border border-[#E0E0E0] bg-white px-3 text-base text-[#212529] placeholder:text-[#5C636A] focus:border-[#186734] focus:outline-2 focus:outline-[#186734] sm:text-sm";

export function CustomerDirectory() {
  const { data: session, status: sessionStatus } = useSession();
  const caps = directoryCapabilities(session?.user?.role);
  const [query, setQuery] = useState<CustomerQuery>({ page: 1, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "danger"; title: string; detail?: string } | null>(null);
  const enabled = sessionStatus === "authenticated" && caps.canReadCustomers;

  const list = useLoad(enabled ? JSON.stringify(query) : null, (signal) => customerClient.list(query, signal));
  // Stat tiles reuse the list endpoint: totalItems of a one-row page per status, in the actor's own scope.
  const stats = useLoad(enabled ? "stats" : null, async (signal) => {
    const [all, active, locked] = await Promise.all([
      customerClient.list({ page: 1, pageSize: 10 }, signal),
      customerClient.list({ page: 1, pageSize: 10, status: "Active" }, signal),
      customerClient.list({ page: 1, pageSize: 10, status: "Locked" }, signal),
    ]);
    return { all: all.pagination.totalItems, active: active.pagination.totalItems, locked: locked.pagination.totalItems };
  });

  if (sessionStatus === "loading") return <SkeletonRows />;
  if (!caps.canReadCustomers) {
    return <Notice tone="danger" title="Bạn không có quyền xem danh sách khách hàng">Trang này dành cho quản trị viên và quản lý tuyến.</Notice>;
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setQuery((current) => ({ ...current, page: 1, q: search.trim() || undefined }));
  }
  function refreshAll() { list.reload(); stats.reload(); }

  const data = list.state.data;
  const failure = list.state.phase === "error" ? describeFailure(list.state.code, list.state.status) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quản lý khách hàng</h1>
          <p className="mt-1 text-sm text-[#5C636A]">
            {caps.customerScope === "all" ? "Tra cứu khách hàng và lịch sử đặt vé." : "Khách hàng thuộc các hóa đơn bạn phụ trách."}
          </p>
        </div>
        <button type="button" onClick={refreshAll} disabled={list.state.phase === "loading"} className={buttonOutline}>
          <RefreshCw aria-hidden="true" className={cn("size-4", list.state.phase === "loading" && "animate-spin")} /> Làm mới
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Tổng khách hàng" value={stats.state.data?.all ?? null} />
        <StatTile label="Đang hoạt động" value={stats.state.data?.active ?? null} tone="success" />
        <StatTile label="Đã khóa" value={stats.state.data?.locked ?? null} tone="danger" />
      </div>

      {notice && <Notice tone={notice.tone} title={notice.title}>{notice.detail}</Notice>}

      <form onSubmit={onSearch} className="flex flex-col gap-3 rounded-[5px] border border-[#E0E0E0] bg-white p-4 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Tìm khách hàng</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#5C636A]" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100}
            placeholder="Tìm theo tên, email hoặc số điện thoại" className={cn(input, "w-full pl-9")} />
        </label>
        <label className="sm:w-52">
          <span className="sr-only">Trạng thái</span>
          <select value={query.status ?? ""} className={cn(input, "w-full")}
            onChange={(event) => setQuery((current) => ({ ...current, page: 1, status: (event.target.value || undefined) as AccountStatus | undefined }))}>
            <option value="">Tất cả trạng thái</option>
            <option value="Active">Đang hoạt động</option>
            <option value="Locked">Đã khóa</option>
          </select>
        </label>
        <button type="submit" className={buttonOutline}>Tìm</button>
      </form>

      <section aria-label="Danh sách khách hàng" className="overflow-hidden rounded-[5px] border border-[#E0E0E0] bg-white">
        {failure && !data ? (
          <div className="p-4"><FailureNotice failure={failure} onRetry={list.reload} /></div>
        ) : !data ? (
          <SkeletonRows />
        ) : data.items.length === 0 ? (
          <EmptyBlock icon={<Users aria-hidden="true" className="size-10" />} title="Không có khách hàng phù hợp"
            action={(query.q || query.status) ? <button type="button" className={buttonOutline}
              onClick={() => { setSearch(""); setQuery((current) => ({ page: 1, pageSize: current.pageSize })); }}>Xóa bộ lọc</button> : undefined}>
            {(query.q || query.status) ? "Thử đổi từ khóa hoặc bộ lọc trạng thái." : "Chưa có khách hàng nào trong phạm vi của bạn."}
          </EmptyBlock>
        ) : (
          <>
            {failure && <div className="p-4 pb-0"><FailureNotice failure={failure} onRetry={list.reload} /></div>}
            <CustomerTable items={data.items} onOpen={setSelected} />
            <CustomerCards items={data.items} onOpen={setSelected} />
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} totalItems={data.pagination.totalItems}
              pageSize={data.pagination.pageSize} noun="khách hàng"
              onPage={(page) => setQuery((current) => ({ ...current, page }))}
              onPageSize={(pageSize) => setQuery((current) => ({ ...current, page: 1, pageSize }))} />
          </>
        )}
      </section>

      {selected !== null && (
        <CustomerDetailDrawer customerId={selected} canManage={caps.canManageAccounts} onClose={() => setSelected(null)}
          onChanged={(message) => { setNotice({ tone: "info", title: message }); refreshAll(); }} />
      )}
    </div>
  );
}

function FailureNotice({ failure, onRetry }: { failure: Failure; onRetry: () => void }) {
  return (
    <Notice tone="danger" title={failure.title}
      action={failure.signIn ? <Link href="/staff/login" className={buttonOutline}>Đăng nhập lại</Link>
        : failure.retryable ? <button type="button" onClick={onRetry} className={buttonOutline}>Thử lại</button> : undefined}>
      {failure.detail}
    </Notice>
  );
}

function CustomerTable({ items, onOpen }: { items: CustomerSummaryDto[]; onOpen: (id: number) => void }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-[#E0E0E0] bg-[#F8F9FA] text-[13px] font-semibold text-[#5C636A]">
          <tr>
            <th scope="col" className="px-4 py-3">Khách hàng</th>
            <th scope="col" className="px-4 py-3">Số điện thoại</th>
            <th scope="col" className="px-4 py-3 text-center">Trạng thái</th>
            <th scope="col" className="px-4 py-3 text-right">Số đơn</th>
            <th scope="col" className="px-4 py-3">Đặt gần nhất</th>
            <th scope="col" className="px-4 py-3">Ngày tạo</th>
            <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E0E0E0]">
          {items.map((customer) => (
            <tr key={customer.user_id} className="hover:bg-[#F8F9FA]">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={customer.full_name} />
                  <div className="min-w-0">
                    <p className="truncate font-bold">{customer.full_name}</p>
                    <p className="truncate text-xs text-[#5C636A]">{customer.email}</p>
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3">{customer.phone}</td>
              <td className="px-4 py-3 text-center"><StatusTag status={customer.status} /></td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCount(customer.invoice_count)}</td>
              <td className={cn("whitespace-nowrap px-4 py-3", !customer.last_booking_at && "text-[#5C636A]")}>{formatDate(customer.last_booking_at)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-[#5C636A]">{formatDate(customer.created_at)}</td>
              <td className="px-4 py-3 text-right">
                <button type="button" onClick={() => onOpen(customer.user_id)}
                  className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap font-semibold text-[#186734] hover:underline">
                  Xem chi tiết <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerCards({ items, onOpen }: { items: CustomerSummaryDto[]; onOpen: (id: number) => void }) {
  return (
    <ul className="divide-y divide-[#E0E0E0] md:hidden">
      {items.map((customer) => (
        <li key={customer.user_id}>
          <button type="button" onClick={() => onOpen(customer.user_id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-[#F8F9FA]">
            <Avatar name={customer.full_name} />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-bold">{customer.full_name}</span>
                <StatusTag status={customer.status} />
              </div>
              <p className="truncate text-xs text-[#5C636A]">{customer.phone} · {customer.email}</p>
              <p className="text-xs text-[#5C636A]">{formatCount(customer.invoice_count)} đơn · Đặt gần nhất {formatDate(customer.last_booking_at)}</p>
            </div>
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-[#5C636A]" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function CustomerDetailDrawer({ customerId, canManage, onClose, onChanged }: {
  customerId: number; canManage: boolean; onClose: () => void; onChanged: (message: string) => void;
}) {
  const detail = useLoad(`customer-${customerId}`, (signal) => customerClient.detail(customerId, signal));
  const [confirm, setConfirm] = useState<AccountStatus | null>(null);
  const data = detail.state.data;
  const customer = data?.customer;

  return (
    <>
      <Drawer labelledBy="customer-detail-title" onClose={onClose}
        title={customer ? (
          <div className="flex items-center gap-3">
            <Avatar name={customer.full_name} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="customer-detail-title" className="truncate text-base font-bold">{customer.full_name}</h2>
                <StatusTag status={customer.status} />
              </div>
              <p className="text-xs text-[#5C636A]">Chi tiết hồ sơ khách hàng</p>
            </div>
          </div>
        ) : <h2 id="customer-detail-title" className="text-base font-bold">Chi tiết khách hàng</h2>}
        footer={<div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[#5C636A]">Hiển thị tối đa 50 đơn gần nhất.</span>
          <button type="button" onClick={onClose} className={buttonOutline}>Đóng</button>
        </div>}>
        {detail.state.phase === "error" && !data ? (
          <FailureNotice failure={describeFailure(detail.state.code, detail.state.status)} onRetry={detail.reload} />
        ) : !customer || !data ? (
          <SkeletonRows rows={4} />
        ) : (
          <div className="space-y-5">
            <dl className="divide-y divide-[#E0E0E0] rounded-[5px] border border-[#E0E0E0] bg-[#F8F9FA] px-3 text-sm">
              {[
                ["Email", customer.email],
                ["Số điện thoại", customer.phone],
                ["Ngày tạo tài khoản", formatDate(customer.created_at)],
                ["Số đơn đã đặt", formatCount(customer.invoice_count)],
                ["Lần đặt gần nhất", formatDate(customer.last_booking_at)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-2.5">
                  <dt className="text-[#5C636A]">{label}</dt>
                  <dd className="min-w-0 break-all text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>

            {canManage && (customer.status === "Active" ? (
              <button type="button" onClick={() => setConfirm("Locked")} className={cn(buttonOutlineDanger, "w-full")}>
                <Lock aria-hidden="true" className="size-4" /> Khóa tài khoản
              </button>
            ) : (
              <button type="button" onClick={() => setConfirm("Active")} className={cn(buttonOutlineGreen, "w-full")}>
                <LockOpen aria-hidden="true" className="size-4" /> Mở khóa tài khoản
              </button>
            ))}

            <section aria-labelledby="booking-history-title" className="space-y-3">
              <h3 id="booking-history-title" className="font-bold">Lịch sử đặt vé</h3>
              {data.bookings.length === 0 ? (
                <EmptyBlock icon={<ReceiptText aria-hidden="true" className="size-8" />} title="Chưa có đơn đặt vé">
                  Khách hàng này chưa đặt chuyến nào.
                </EmptyBlock>
              ) : data.bookings.map((booking) => {
                const responsible = describeResponsible(booking);
                return (
                  <article key={booking.invoice_id} className="space-y-1.5 rounded-[5px] border border-[#E0E0E0] p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold">Hóa đơn #{booking.invoice_id}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold tabular-nums">{formatVnd(booking.total_amount)}</span>
                        <Tag tone={INVOICE_STATUS_TONE[booking.status]}>{INVOICE_STATUS_LABELS[booking.status]}</Tag>
                      </div>
                    </div>
                    <p className="font-bold">{booking.trip_name}</p>
                    <p className="text-xs text-[#5C636A]">Khởi hành {formatDateTime(booking.departure_date)} · Đặt ngày {formatDate(booking.created_at)}</p>
                    {responsible && <p className="text-xs text-[#5C636A]">Phụ trách: {responsible}</p>}
                    {booking.tickets.length > 0 && (
                      <ul className="space-y-1 border-t border-[#E0E0E0] pt-2">
                        {booking.tickets.map((ticket) => (
                          <li key={ticket.detail_id} className="rounded-[5px] bg-[#F8F9FA] px-2 py-1 text-xs">{describeTicket(ticket)}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </section>
          </div>
        )}
      </Drawer>

      {confirm && customer && (
        <LockDialog name={customer.full_name} email={customer.email} target={confirm} userId={customer.user_id}
          onClose={() => setConfirm(null)}
          onDone={() => { setConfirm(null); detail.reload(); onChanged(confirm === "Locked" ? "Đã khóa tài khoản khách hàng" : "Đã mở khóa tài khoản khách hàng"); }} />
      )}
    </>
  );
}

// Real A01 call: customers here come from the C03 API, so their ids are real accounts.
function LockDialog({ name, email, target, userId, onClose, onDone }: {
  name: string; email: string; target: AccountStatus; userId: number; onClose: () => void; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const inFlight = useRef(false);
  const locking = target === "Locked";

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await updateAccountAccess(userId, { status: target });
      onDone();
    } catch (cause) {
      const error = cause instanceof AccountClientError ? cause : new AccountClientError(0, "NETWORK_ERROR", "");
      setFailure(describeFailure(error.code, error.status, locking ? "lock" : "unlock"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog labelledBy="customer-lock-title" busy={busy} onClose={onClose}
      title={<>{locking ? <Lock aria-hidden="true" className="size-5 text-[#C62828]" /> : <LockOpen aria-hidden="true" className="size-5 text-[#186734]" />}
        {locking ? "Khóa tài khoản" : "Mở khóa tài khoản"}</>}
      actions={<>
        <button type="button" onClick={onClose} disabled={busy} className={buttonOutline}>Hủy</button>
        <button type="button" onClick={submit} disabled={busy} className={locking ? buttonDanger : buttonGreen}>
          {busy ? <Spinner /> : locking ? <Lock aria-hidden="true" className="size-4" /> : <LockOpen aria-hidden="true" className="size-4" />}
          {locking ? "Khóa tài khoản" : "Mở khóa"}
        </button>
      </>}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-[5px] bg-[#F5F5F5]"><UserRound aria-hidden="true" className="size-5" /></span>
        <div className="min-w-0">
          <p className="truncate font-bold">{name}</p>
          <p className="truncate text-sm text-[#5C636A]">{email}</p>
        </div>
      </div>
      {locking ? (
        <Notice tone="warning" title="Người dùng sẽ bị đăng xuất">
          Tài khoản không thể đăng nhập cho đến khi được mở khóa. Đơn đặt vé và vé đã mua được giữ nguyên.
        </Notice>
      ) : (
        <p className="text-sm">Sau khi mở khóa, người dùng đăng nhập lại bình thường. Mật khẩu không thay đổi.</p>
      )}
      {failure && <Notice tone="danger" title={failure.title}>{failure.detail}</Notice>}
    </Dialog>
  );
}
