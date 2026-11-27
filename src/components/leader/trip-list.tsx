"use client";

import Link from "next/link";
import { useState } from "react";
import { Backpack, CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  countByTab, defaultTripTab, departuresForTab, formatDepartureDate, tripTabs,
  type LeaderDepartureSummary, type TripTab,
} from "@/lib/leader-ui";
import { DepartureStatusBadge, EmptyState, buttonOutlineGreen } from "./leader-ui-parts";

const emptyCopy: Record<TripTab, string> = {
  upcoming: "Chưa có chuyến sắp đi nào được phân công cho bạn.",
  running: "Hiện không có chuyến nào đang chạy.",
  ended: "Chưa có chuyến nào đã kết thúc.",
};

export function TripList({ departures }: { departures: LeaderDepartureSummary[] }) {
  const [tab, setTab] = useState<TripTab>(() => defaultTripTab(departures));
  const counts = countByTab(departures);
  const visible = departuresForTab(departures, tab);

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Chuyến được phân công</h1>
        <p className="mt-1 text-sm text-[#5C636A]">Chỉ hiển thị chuyến bạn phụ trách.</p>
      </div>

      <div role="tablist" aria-label="Lọc theo trạng thái chuyến" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {tripTabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
            className={cn("min-h-11 shrink-0 whitespace-nowrap rounded-[5px] border px-4 text-sm font-semibold",
              tab === item.id ? "border-[#186734] bg-[#186734] text-white" : "border-[#E0E0E0] bg-white text-[#212529] hover:border-[#6B7280]")}>
            {item.label} ({counts[item.id]})
          </button>
        ))}
      </div>

      {departures.length === 0 ? (
        <EmptyState icon={<Backpack className="size-10" aria-hidden="true" />} title="Chưa có chuyến nào được phân công">
          Khi bạn được phân công dẫn đoàn, chuyến sẽ hiện tại đây.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon={<Backpack className="size-10" aria-hidden="true" />} title="Chưa có chuyến ở mục này">
          {emptyCopy[tab]}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((departure) => (
            <li key={departure.departure_id} className="flex flex-col rounded-[5px] border border-[#E0E0E0] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 break-words text-lg font-bold leading-snug">{departure.trip.name}</h2>
                <DepartureStatusBadge status={departure.status} />
              </div>
              <dl className="mb-3 mt-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-[#5C636A]" />
                  <dt className="sr-only">Khởi hành</dt>
                  <dd>Khởi hành {formatDepartureDate(departure.departure_date)}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin aria-hidden="true" className="size-4 shrink-0 text-[#5C636A]" />
                  <dt className="sr-only">Địa điểm</dt>
                  <dd className="min-w-0 truncate">{departure.trip.location_name}, {departure.trip.city}</dd>
                </div>
                <div className="text-[#5C636A]">
                  <dt className="inline">Mã chuyến </dt><dd className="inline font-mono">#{departure.departure_id}</dd>
                </div>
                {departure.is_demo && <p className="text-xs font-semibold text-[#8A5A00]">Dữ liệu mẫu tham khảo</p>}
              </dl>
              <div className="mt-auto border-t border-[#E0E0E0] pt-3">
                <Link href={`/leader/departures/${departure.departure_id}`} className={cn(buttonOutlineGreen, "w-full")}>
                  Mở danh sách khách
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
