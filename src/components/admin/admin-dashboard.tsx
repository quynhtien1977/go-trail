"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CalendarDays, CircleAlert, PackageX, RefreshCw } from "lucide-react";
import { Notice, Tag, buttonOutline, smallButton } from "@/components/accounts/ui-parts";
import { useLoad } from "@/components/accounts/use-load";
import { cn } from "@/lib/utils";
import { describeFailure, formatCount } from "@/lib/customer-account-ui";
import {
  DASHBOARD_PERIODS, dailySeries, dashboardClient, formatIsoDate, formatMillions, formatMoney, formatShortDate, growth, percent,
  periodRange, previousRange, routeBreakdown, type DashboardPeriod, type RevenueReport, type StaffDashboard,
} from "@/lib/admin-insights-ui";
import type { Page, TripSummaryDto } from "@/schemas/catalog";

// Q04 dashboard (Stitch "Q04 - Dashboard") on the SCRUM-45/46 APIs: ticket revenue = Paid invoices only (PRD 7.3).
export function AdminDashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [now, setNow] = useState(() => new Date());
  const range = periodRange(period, now);
  const previous = previousRange(range);

  const load = useLoad<Loaded>(JSON.stringify(["admin-dashboard", range]), async (signal) => {
    const [daily, byTrip, prior, operations, trips] = await Promise.all([
      dashboardClient.revenue(range, "day", signal),
      dashboardClient.revenue(range, "trip", signal),
      dashboardClient.revenue(previous, "day", signal),
      dashboardClient.operations(range, signal),
      dashboardClient.trips(signal).catch(() => null), // names only; fall back to "Tuyến #id"
    ]);
    return { daily, byTrip, prior, operations, trips };
  });

  const refresh = () => { setNow(new Date()); load.reload(); };
  const state = load.state;
  const data = state.phase === "ready" ? state.data : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tổng quan</h1>
          <p className="mt-1 text-sm text-[#5C636A]">Doanh thu và tình hình vận hành theo khoảng thời gian đã chọn.</p>
        </div>
        <button type="button" onClick={refresh} disabled={state.phase === "loading"} className={buttonOutline}>
          <RefreshCw aria-hidden="true" className={cn("size-4", state.phase === "loading" && "animate-spin motion-reduce:animate-none")} /> Làm mới
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-[5px] border border-[#E0E0E0] bg-white p-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Khoảng thời gian" className="flex gap-1 overflow-x-auto">
          {DASHBOARD_PERIODS.map((item) => (
            <button key={item.value} type="button" onClick={() => setPeriod(item.value)} aria-pressed={period === item.value}
              className={cn("min-h-9 shrink-0 rounded-[5px] border px-3 text-xs font-medium transition-colors",
                period === item.value ? "border-[#E0E0E0] bg-[#F8F9FA] font-semibold text-[#111111]" : "border-transparent text-[#5C636A] hover:bg-neutral-100")}>
              {item.label}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-2 px-1 text-xs font-medium text-[#5C636A]">
          <CalendarDays aria-hidden="true" className="size-4" /> {formatIsoDate(range.from)} – {formatIsoDate(range.to)}
        </p>
      </div>

      {state.phase === "error" && (() => {
        const failure = describeFailure(state.code, state.status);
        return (
          <Notice tone="danger" title={failure.title === "Không tìm thấy tài khoản" ? "Không tải được số liệu" : failure.title}
            action={failure.retryable || state.status >= 500 || state.status === 0
              ? <button type="button" onClick={refresh} className={buttonOutline}>Thử lại</button> : undefined}>
            {state.status >= 500 || state.status === 0 ? "Máy chủ báo cáo chưa phản hồi. Vui lòng thử lại." : failure.detail}
          </Notice>
        );
      })()}

      <Kpis data={data} />

      <section aria-labelledby="todo-heading">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="todo-heading" className="text-base font-bold">Cần xử lý</h2>
          {data && <Tag tone="neutral">{todoCount(data) > 0 ? `${todoCount(data)} mục chờ xử lý` : "Không có mục nào"}</Tag>}
        </div>
        {!data ? <div className="h-24 animate-pulse rounded-[5px] border border-[#E0E0E0] bg-white" /> : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <AlertCard tone={data.daily.totals.needs_review_count > 0 ? "warning" : "ok"} icon="review"
              title={data.daily.totals.needs_review_count > 0 ? `${data.daily.totals.needs_review_count} thanh toán cần rà soát` : "Không có thanh toán cần rà soát"}
              text={data.daily.totals.needs_review_count > 0
                ? `Tổng ${formatMoney(data.daily.totals.needs_review_amount)} chưa khớp hóa đơn trong kỳ, cần đối soát thủ công.`
                : "Mọi khoản chuyển khoản trong kỳ đã khớp hóa đơn."}
              href="/admin/reconciliation" action="Mở đối soát" />
            <AlertCard tone={(data.operations.warehouse_low_stock_now?.items.length ?? 0) > 0 ? "danger" : "ok"} icon="stock"
              title={(data.operations.warehouse_low_stock_now?.items.length ?? 0) > 0
                ? `${data.operations.warehouse_low_stock_now!.items.length}${data.operations.warehouse_low_stock_now!.next_cursor ? "+" : ""} vật tư sắp hết`
                : "Kho vật tư đủ"}
              text={(data.operations.warehouse_low_stock_now?.items.length ?? 0) > 0
                ? `${data.operations.warehouse_low_stock_now!.items.slice(0, 3).map((item) => `${item.name} (${item.on_hand} ${item.unit})`).join(", ")}`
                : "Không có vật tư nào dưới ngưỡng cảnh báo."}
              href="/staff/supplies" action="Mở kho vật tư" />
          </div>
        )}
      </section>

      <RevenueChart data={data} range={range} />

      <section aria-labelledby="routes-heading" className="rounded-[5px] border border-[#E0E0E0] bg-white p-4">
        <div className="mb-4 flex items-center justify-between border-b border-[#E0E0E0] pb-3">
          <h2 id="routes-heading" className="text-sm font-bold">Doanh thu theo tuyến</h2>
          <span className="text-xs text-[#5C636A]">Top tuyến trong kỳ</span>
        </div>
        {!data ? <div className="h-40 animate-pulse rounded-[5px] bg-neutral-100" /> : (() => {
          const total = Number(data.byTrip.totals.ticket_revenue);
          const names = new Map((data.trips?.items ?? []).map((trip) => [trip.trip_id, trip.name]));
          const rows = routeBreakdown(data.byTrip, names);
          if (rows.length === 0) return <p className="py-6 text-center text-sm text-[#5C636A]">Chưa có doanh thu vé trong kỳ này.</p>;
          return (
            <>
              <ul className="grid gap-x-8 gap-y-3.5 md:grid-cols-2">
                {rows.map((route) => (
                  <li key={route.label} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-semibold">{route.label}</span>
                      <span className="shrink-0 font-bold tabular-nums">{formatMoney(route.amount)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-[2px] bg-neutral-100">
                      <div className={cn("h-full", route.other ? "bg-neutral-400" : "bg-[#186734]")} style={{ width: `${total ? (route.amount / total) * 100 : 0}%` }} />
                    </div>
                    <p className="text-xs text-[#5C636A]">{percent(route.amount, total)}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t border-[#E0E0E0] pt-3 text-xs">
                <span className="font-medium text-[#5C636A]">Tổng doanh thu vé</span>
                <span className="font-bold tabular-nums">{formatMoney(total)}</span>
              </div>
            </>
          );
        })()}
      </section>
    </div>
  );
}

type Loaded = { daily: RevenueReport; byTrip: RevenueReport; prior: RevenueReport; operations: StaffDashboard; trips: Page<TripSummaryDto> | null };

function todoCount(data: Loaded) {
  return [data.daily.totals.needs_review_count > 0, (data.operations.warehouse_low_stock_now?.items.length ?? 0) > 0].filter(Boolean).length;
}

function Kpis({ data }: { data?: Loaded }) {
  if (!data) {
    return (
      <div role="status" aria-label="Đang tải số liệu" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => <div key={index} className="h-[118px] animate-pulse rounded-[5px] border border-[#E0E0E0] bg-white" />)}
      </div>
    );
  }
  const totals = data.daily.totals;
  const revenue = Number(totals.ticket_revenue);
  const change = growth(revenue, Number(data.prior.totals.ticket_revenue));
  const ops = data.operations.operations;
  return (
    <section aria-label="Chỉ số chính" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Doanh thu vé" value={formatMoney(totals.ticket_revenue)}
        helper={`${formatCount(totals.paid)} hóa đơn đã thanh toán${change ? ` · ${change} so với kỳ trước` : ""}`} />
      <Kpi label="Vé hợp lệ" value={`${formatCount(data.operations.passengers?.valid_tickets ?? 0)} vé`}
        helper={`${formatCount(data.operations.passengers?.checked_in ?? 0)} đã check-in · chuyến khởi hành trong kỳ`} />
      <Kpi label="Chuyến khởi hành" value={`${formatCount(ops.departures)} chuyến`} helper={`${formatCount(ops.vehicles)} xe · ${formatCount(ops.staff)} nhân sự`} />
      <Kpi label="Tỷ lệ lấp đầy" value={percent(ops.seats_sold, ops.seats)} helper={`${formatCount(ops.seats_sold)}/${formatCount(ops.seats)} ghế đã bán`} accent />
      <p className="text-xs text-[#5C636A] sm:col-span-2 xl:col-span-4">
        Thực nhận {formatMoney(totals.received)} · chuyển thừa {formatMoney(totals.surplus)} (theo dõi ở đối soát, không cộng vào doanh thu vé).
      </p>
    </section>
  );
}

function RevenueChart({ data, range }: { data?: Loaded; range: { from: string; to: string } }) {
  const days = data ? dailySeries(range, data.daily) : [];
  const max = Math.max(...days.map((day) => day.amount), 1);
  const ticks = [1, 0.5].map((ratio) => max * ratio);
  return (
    <section aria-labelledby="chart-heading" className="rounded-[5px] border border-[#E0E0E0] bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 border-b border-[#E0E0E0] pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="chart-heading" className="text-base font-bold">Doanh thu theo ngày</h2>
          <p className="mt-0.5 text-xs text-[#5C636A]">Tính theo ngày nhận khoản thanh toán đầu tiên của hóa đơn đã thanh toán.</p>
        </div>
        <p className="flex items-center gap-2 text-xs text-[#5C636A]"><span aria-hidden="true" className="size-3 rounded-[2px] bg-[#186734]" /> Doanh thu vé</p>
      </div>
      {!data ? <div className="h-48 animate-pulse rounded-[5px] bg-neutral-100" /> : days.every((day) => day.amount === 0) ? (
        <p className="py-12 text-center text-sm text-[#5C636A]">Chưa có doanh thu vé trong kỳ này.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(320, days.length * 18) }}>
              <div className="relative flex h-48 items-end gap-1 border-b border-[#E0E0E0] pl-12">
                {ticks.map((tick) => (
                  <div key={tick} aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-neutral-200" style={{ bottom: `${(tick / max) * 100}%` }}>
                    <span className="absolute -top-2 left-0 text-xs text-[#9CA3AF]">{formatMillions(tick)}</span>
                  </div>
                ))}
                {days.map((day) => (
                  <div key={day.date} className="group relative z-10 flex h-full flex-1 items-end justify-center">
                    <div title={`${formatIsoDate(day.date)}: ${formatMoney(day.amount)}`}
                      className="w-full max-w-[24px] rounded-t-[2px] bg-[#186734] transition-colors group-hover:bg-[#004E22]"
                      style={{ height: `${Math.max((day.amount / max) * 100, day.amount > 0 ? 1 : 0)}%` }} />
                  </div>
                ))}
              </div>
              <div aria-hidden="true" className="flex justify-between pl-12 pt-2 text-xs text-[#9CA3AF]">
                <span>{formatShortDate(range.from)}</span><span>{formatShortDate(range.to)}</span>
              </div>
            </div>
          </div>
          <table className="sr-only">
            <caption>Doanh thu theo ngày</caption>
            <tbody>{days.map((day) => <tr key={day.date}><th>{formatIsoDate(day.date)}</th><td>{formatMoney(day.amount)}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </section>
  );
}

function Kpi({ label, value, helper, accent }: { label: string; value: string; helper: string; accent?: boolean }) {
  return (
    <div className="flex flex-col justify-between rounded-[5px] border border-[#E0E0E0] bg-white p-4">
      <div>
        <p className="text-xs font-semibold text-[#5C636A]">{label}</p>
        <p className={cn("mt-1.5 text-2xl font-bold tabular-nums", accent ? "text-[#186734]" : "text-[#111111]")}>{value}</p>
      </div>
      <p className="mt-3 border-t border-[#E0E0E0] pt-2.5 text-xs text-[#5C636A]">{helper}</p>
    </div>
  );
}

function AlertCard({ tone, icon, title, text, href, action }: {
  tone: "warning" | "danger" | "ok"; icon: "review" | "stock"; title: string; text: string; href: string; action: string;
}) {
  const Icon = icon === "stock" ? PackageX : tone === "warning" ? AlertTriangle : CircleAlert;
  return (
    <div className="flex flex-col justify-between rounded-[5px] border border-[#E0E0E0] bg-white p-4">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[5px] border",
          tone === "warning" ? "border-[#FFE082] bg-[#FFF8E1] text-[#8A5A00]"
            : tone === "danger" ? "border-[#FFCDD2] bg-[#FFEBEE] text-[#C62828]" : "border-[#C8E6C9] bg-[#E8F5E9] text-[#186734]")}>
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-1 text-xs text-[#5C636A]">{text}</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end border-t border-[#E0E0E0] pt-3">
        <Link href={href} className={cn(buttonOutline, smallButton)}>{action}</Link>
      </div>
    </div>
  );
}
