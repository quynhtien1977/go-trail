"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CalendarDays, CircleAlert, RefreshCw } from "lucide-react";
import { Notice, Tag, buttonOutline, smallButton } from "@/components/accounts/ui-parts";
import { cn } from "@/lib/utils";
import { formatCount, formatDate } from "@/lib/customer-account-ui";
import {
  DASHBOARD_PERIODS, DEPARTURE_STATUS_LABELS, DEPARTURE_STATUS_TONE, demoDashboard, formatMillions, formatMoney, growth, percent,
  type DashboardPeriod,
} from "@/lib/admin-insights-ui";

// Q04 dashboard (Stitch "Q04 - Dashboard"). Demo data until a revenue/report API exists.
export function AdminDashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [refreshedAt, setRefreshedAt] = useState(0);
  const data = demoDashboard(period);
  const change = growth(data.revenue, data.previousRevenue);
  const maxDay = Math.max(...data.daily.map((day) => day.amount), 1);
  const ticks = [1, 0.75, 0.5, 0.25].map((ratio) => Math.round(maxDay * ratio));
  const routeRows = data.otherRoutes ? [...data.routes, data.otherRoutes] : data.routes;
  const pending = [data.alerts.paymentsNeedingReview, data.alerts.overdueOpenDepartures].filter((count) => count > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tổng quan</h1>
          <p className="mt-1 text-sm text-[#5C636A]">Doanh thu và tình hình vận hành theo khoảng thời gian đã chọn.</p>
        </div>
        <button type="button" onClick={() => setRefreshedAt((value) => value + 1)} className={buttonOutline}>
          <RefreshCw aria-hidden="true" className="size-4" /> Làm mới
        </button>
      </div>

      <Notice tone="info" title="Đang hiển thị dữ liệu minh họa">
        Chưa có API báo cáo doanh thu. Số liệu dưới đây là dữ liệu mẫu theo đúng công thức: doanh thu vé = tổng hóa đơn đã thanh toán,
        không cộng phần chuyển thừa.
      </Notice>

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
          <CalendarDays aria-hidden="true" className="size-4" /> {formatDate(data.from)} – {formatDate(data.to)}
          {refreshedAt > 0 && <span className="sr-only" role="status">Đã làm mới</span>}
        </p>
      </div>

      <section aria-label="Chỉ số chính" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Doanh thu vé" value={formatMoney(data.revenue)}
          helper={`Tổng hóa đơn đã thanh toán${change ? ` · ${change} so với kỳ trước` : ""}`} />
        <Kpi label="Vé đã bán" value={`${formatCount(data.ticketsSold)} vé`} helper="Vé hợp lệ trong kỳ" />
        <Kpi label="Chuyến khởi hành" value={`${formatCount(data.departures.total)} chuyến`}
          helper={`${data.departures.ended} đã kết thúc · ${data.departures.running} đang chạy · ${data.departures.confirmed} đã xác nhận`} />
        <Kpi label="Tỷ lệ lấp đầy" value={percent(data.ticketsSold, data.seatsOffered)} helper="Ghế đã bán trên tổng ghế" accent />
      </section>

      <section aria-labelledby="todo-heading">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="todo-heading" className="text-base font-bold">Cần xử lý</h2>
          <Tag tone="neutral">{pending > 0 ? `${pending} mục chờ xử lý` : "Không có mục nào"}</Tag>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AlertCard tone="warning" title={`${data.alerts.paymentsNeedingReview} thanh toán cần rà soát`}
            text="Khoản chuyển khoản không khớp hóa đơn, cần đối soát thủ công." href="/admin/reconciliation" action="Mở đối soát" />
          <AlertCard tone="danger" title={`${data.alerts.overdueOpenDepartures} chuyến đã quá hạn chốt bán`}
            text="Chuyến vẫn đang mở bán dù đã qua hạn chốt. Cần chuyển sang Đã chốt bán." href="/staff" action="Xem chuyến" />
        </div>
      </section>

      <section aria-labelledby="chart-heading" className="rounded-[5px] border border-[#E0E0E0] bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 border-b border-[#E0E0E0] pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="chart-heading" className="text-base font-bold">Doanh thu theo ngày</h2>
            <p className="mt-0.5 text-xs text-[#5C636A]">Tính theo ngày hóa đơn được thanh toán.</p>
          </div>
          <p className="flex items-center gap-2 text-xs text-[#5C636A]"><span aria-hidden="true" className="size-3 rounded-[2px] bg-[#186734]" /> Doanh thu (triệu đồng)</p>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="relative flex h-48 items-end gap-1 border-b border-[#E0E0E0] pl-12">
              {ticks.map((tick, index) => (
                <div key={index} aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-neutral-200"
                  style={{ bottom: `${(tick / maxDay) * 100}%` }}>
                  <span className="absolute -top-2 left-0 text-xs text-[#9CA3AF]">{formatMillions(tick)}</span>
                </div>
              ))}
              {data.daily.map((day) => (
                <div key={day.date} className="group relative z-10 flex h-full flex-1 items-end justify-center">
                  <div title={`${formatDate(day.date)}: ${formatMoney(day.amount)}`}
                    className="w-full max-w-[18px] rounded-t-[2px] bg-[#186734] transition-colors group-hover:bg-[#004E22]"
                    style={{ height: `${(day.amount / maxDay) * 100}%` }} />
                </div>
              ))}
            </div>
            <div aria-hidden="true" className="flex justify-between pl-12 pt-2 text-xs text-[#9CA3AF]">
              <span>{formatDate(data.from).slice(0, 5)}</span><span>{formatDate(data.to).slice(0, 5)}</span>
            </div>
          </div>
        </div>
        <table className="sr-only">
          <caption>Doanh thu theo ngày</caption>
          <tbody>{data.daily.map((day) => <tr key={day.date}><th>{formatDate(day.date)}</th><td>{formatMoney(day.amount)}</td></tr>)}</tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section aria-labelledby="routes-heading" className="flex flex-col rounded-[5px] border border-[#E0E0E0] bg-white p-4 xl:col-span-4">
          <div className="mb-4 flex items-center justify-between border-b border-[#E0E0E0] pb-3">
            <h2 id="routes-heading" className="text-sm font-bold">Doanh thu theo tuyến</h2>
            <span className="text-xs text-[#5C636A]">Top tuyến</span>
          </div>
          <ul className="flex-1 space-y-3.5">
            {routeRows.map((route, index) => (
              <li key={route.route} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold">{route.route}</span>
                  <span className="shrink-0 font-bold tabular-nums">{formatMoney(route.amount)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-[2px] bg-neutral-100">
                  <div className={cn("h-full", index < data.routes.length ? "bg-[#186734]" : "bg-neutral-400")}
                    style={{ width: `${data.revenue ? (route.amount / data.revenue) * 100 : 0}%` }} />
                </div>
                <p className="text-xs text-[#5C636A]">{percent(route.amount, data.revenue)} · {route.departures} chuyến</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-[#E0E0E0] pt-3 text-xs">
            <span className="font-medium text-[#5C636A]">Tổng doanh thu</span>
            <span className="font-bold tabular-nums">{formatMoney(data.revenue)}</span>
          </div>
        </section>

        <section aria-labelledby="recent-heading" className="rounded-[5px] border border-[#E0E0E0] bg-white p-4 xl:col-span-8">
          <div className="mb-3 flex items-center justify-between border-b border-[#E0E0E0] pb-3">
            <h2 id="recent-heading" className="text-sm font-bold">Chuyến gần đây</h2>
            <Link href="/staff" className="text-xs font-semibold text-[#186734] hover:underline">Xem tất cả chuyến</Link>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E0E0E0] text-xs text-[#5C636A]">
                <tr>
                  <th className="px-2 py-2 font-semibold">Mã chuyến</th><th className="px-2 py-2 font-semibold">Tuyến</th>
                  <th className="px-2 py-2 font-semibold">Khởi hành</th><th className="px-2 py-2 font-semibold">Leader</th>
                  <th className="px-2 py-2 text-center font-semibold">Vé / ghế</th><th className="px-2 py-2 text-right font-semibold">Doanh thu</th>
                  <th className="px-2 py-2 text-center font-semibold">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E0E0]">
                {data.recent.map((row) => (
                  <tr key={row.departure_id}>
                    <td className="px-2 py-2.5 text-[#5C636A]">#{row.departure_id}</td>
                    <td className="px-2 py-2.5 font-medium">{row.route}</td>
                    <td className="px-2 py-2.5 text-[#5C636A]">{formatDate(row.departure_date)}</td>
                    <td className="px-2 py-2.5">{row.leader ?? <span className="text-[#5C636A]">Chưa phân công</span>}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{row.sold}/{row.seats}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatMoney(row.revenue)}</td>
                    <td className="px-2 py-2.5 text-center"><Tag tone={DEPARTURE_STATUS_TONE[row.status]}>{DEPARTURE_STATUS_LABELS[row.status]}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-[#E0E0E0] md:hidden">
            {data.recent.map((row) => (
              <li key={row.departure_id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{row.route}</p>
                  <Tag tone={DEPARTURE_STATUS_TONE[row.status]}>{DEPARTURE_STATUS_LABELS[row.status]}</Tag>
                </div>
                <p className="mt-1 text-xs text-[#5C636A]">#{row.departure_id} · {formatDate(row.departure_date)} · {row.leader ?? "Chưa phân công"}</p>
                <p className="mt-1 text-xs">{row.sold}/{row.seats} vé · <span className="font-semibold">{formatMoney(row.revenue)}</span></p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
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

function AlertCard({ tone, title, text, href, action }: { tone: "warning" | "danger"; title: string; text: string; href: string; action: string }) {
  const Icon = tone === "warning" ? AlertTriangle : CircleAlert;
  return (
    <div className="flex flex-col justify-between rounded-[5px] border border-[#E0E0E0] bg-white p-4">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[5px] border",
          tone === "warning" ? "border-[#FFE082] bg-[#FFF8E1] text-[#8A5A00]" : "border-[#FFCDD2] bg-[#FFEBEE] text-[#C62828]")}>
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
