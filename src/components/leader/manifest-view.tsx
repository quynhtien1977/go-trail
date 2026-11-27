"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Flag, Loader2, Phone, QrCode, RefreshCw, Search, UsersRound } from "lucide-react";
import type { ManifestDto, ManifestPassengerDto } from "@/schemas/checkin";
import { cn } from "@/lib/utils";
import {
  LeaderClientError, describeLeaderError, filterPassengers, formatClock, formatDepartureDate, formatPhone,
  groupByPickup, leaderClient, passengerFilters, telHref, type PassengerFilter, type ScanOutcome,
} from "@/lib/leader-ui";
import { LeaderShell } from "./leader-shell";
import {
  CheckInBadge, DepartureStatusBadge, EmptyState, LoadingBlock, Notice,
  buttonOutline, buttonOutlineDanger, buttonYellow,
} from "./leader-ui-parts";
import { EndDepartureDialog } from "./end-departure-dialog";
import { useManifest } from "./use-manifest";

export function ManifestView({ departureId }: { departureId: number }) {
  const { state, reload, applyUpdate } = useManifest(departureId);
  const [filter, setFilter] = useState<PassengerFilter>("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<ScanOutcome | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const data = state.data;
  const scanHref = `/leader/departures/${departureId}/scan`;

  const topBar = {
    kind: "detail" as const,
    backHref: "/leader",
    backLabel: "Về danh sách chuyến",
    title: data?.departure.trip_name ?? "Danh sách khách",
    subtitle: data ? `${formatDepartureDate(data.departure.departure_date)} · #${departureId}` : `Mã chuyến #${departureId}`,
    aside: data ? <DepartureStatusBadge status={data.departure.status} /> : undefined,
  };

  if (!data) {
    return (
      <LeaderShell topBar={topBar} scanHref={scanHref}>
        {state.phase === "error" ? <ManifestError code={state.code} status={state.status} onRetry={reload} /> : <LoadingBlock label="Đang tải danh sách khách…" />}
      </LeaderShell>
    );
  }

  const open = data.departure.check_in_open;
  const footer = data.departure.status === "Ended" ? undefined : (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Link href={scanHref} className={cn(buttonYellow, "min-h-12 flex-1 text-base")}>
        <QrCode aria-hidden="true" className="size-5" /> Quét QR check-in
      </Link>
      {data.departure.status === "Running" && (
        <button type="button" onClick={() => setEndOpen(true)} className={cn(buttonOutlineDanger, "sm:w-56")}>
          <Flag aria-hidden="true" className="size-4" /> Kết thúc chuyến
        </button>
      )}
    </div>
  );

  return (
    <LeaderShell topBar={topBar} scanHref={scanHref} footer={footer}>
      <div className="space-y-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
        <aside className="space-y-4 lg:sticky lg:top-20">
          <SummaryTiles summary={data.summary} />
          {state.phase === "error" && (
            <Notice tone="warning" title="Chưa cập nhật được danh sách"
              action={<button type="button" onClick={reload} className={buttonOutline}>Thử lại</button>}>
              Đang hiển thị dữ liệu lần tải trước.
            </Notice>
          )}
          {data.departure.status === "Ended" && (
            <Notice tone="neutral" title="Chuyến đã kết thúc">Danh sách chỉ để xem, không thể check-in hoặc báo vắng nữa.</Notice>
          )}
          {data.departure.status === "Confirmed" && (
            <p className="text-sm text-[#5C636A]">Nút kết thúc chuyến sẽ hiện khi chuyến chuyển sang đang chạy.</p>
          )}
          {notice && <Notice tone={notice.tone} title={notice.title}>{notice.detail}</Notice>}
          <CrewSection crew={data.crew} />
        </aside>

        <section aria-label="Hành khách" className="space-y-3">
          <div className="flex gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Tìm hành khách</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#5C636A]" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm tên, số điện thoại hoặc ghế" enterKeyHint="search"
                className="h-11 w-full rounded-[5px] border border-[#6B7280] bg-white pl-10 pr-3 text-base placeholder:text-[#5C636A] focus:border-[#186734] focus:outline-2 focus:outline-[#186734] sm:text-sm" />
            </label>
            <button type="button" onClick={reload} disabled={state.phase === "loading"} aria-label="Tải lại danh sách"
              className={cn(buttonOutline, "w-11 px-0")}>
              <RefreshCw aria-hidden="true" className={cn("size-5", state.phase === "loading" && "animate-spin")} />
            </button>
          </div>

          <div role="radiogroup" aria-label="Lọc theo trạng thái check-in" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
            {passengerFilters.map((item) => {
              const count = item.id === "all" ? data.summary.total : item.id === "Pending" ? data.summary.pending
                : item.id === "CheckedIn" ? data.summary.checked_in : data.summary.absent;
              return (
                <button key={item.id} type="button" role="radio" aria-checked={filter === item.id} onClick={() => setFilter(item.id)}
                  className={cn("min-h-11 shrink-0 whitespace-nowrap rounded-[5px] border px-3 text-sm font-semibold",
                    filter === item.id ? "border-[#186734] bg-[#186734] text-white" : "border-[#E0E0E0] bg-white hover:border-[#6B7280]")}>
                  {item.label} ({count})
                </button>
              );
            })}
          </div>

          <PassengerGroups data={data} filter={filter} query={query} canMarkAbsent={open}
            onUpdated={(passenger) => { applyUpdate(passenger); setNotice(null); }}
            onError={setNotice} />
        </section>
      </div>

      {endOpen && (
        <EndDepartureDialog manifest={data} onClose={() => setEndOpen(false)}
          onEnded={(outcome) => { setEndOpen(false); setNotice(outcome); reload(); }} />
      )}
    </LeaderShell>
  );
}

function ManifestError({ code, status, onRetry }: { code: string; status: number; onRetry: () => void }) {
  if (code === "NOT_FOUND" || status === 404 || status === 403) {
    return (
      <EmptyState icon={<UsersRound aria-hidden="true" className="size-10" />} title="Không mở được chuyến này"
        action={<Link href="/leader" className={buttonOutline}>Về danh sách chuyến</Link>}>
        Chuyến không tồn tại hoặc không còn được phân công cho bạn.
      </EmptyState>
    );
  }
  const outcome = describeLeaderError(code, status);
  return (
    <Notice tone="danger" title="Không tải được danh sách khách"
      action={code === "UNAUTHENTICATED"
        ? <Link href="/staff/login" className={buttonOutline}>Đăng nhập lại</Link>
        : <button type="button" onClick={onRetry} className={buttonOutline}>Thử lại</button>}>
      {outcome.detail}
    </Notice>
  );
}

function SummaryTiles({ summary }: { summary: ManifestDto["summary"] }) {
  const tiles = [
    { label: "Tổng", value: summary.total, className: "text-[#212529]" },
    { label: "Đã check-in", value: summary.checked_in, className: "text-[#186734]" },
    { label: "Vắng", value: summary.absent, className: "text-[#C62828]" },
    { label: "Chưa đến", value: summary.pending, className: "text-[#8A5A00]" },
  ];
  return (
    <dl className="grid grid-cols-4 divide-x divide-[#E0E0E0] rounded-[5px] border border-[#E0E0E0] bg-white" aria-live="polite">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex flex-col items-center justify-center px-1 py-3 text-center">
          <dt className={cn("text-xs font-semibold leading-tight", tile.className)}>{tile.label}</dt>
          <dd className={cn("mt-1 text-2xl font-black tabular-nums", tile.className)}>{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CrewSection({ crew }: { crew: ManifestDto["crew"] }) {
  return (
    <details open className="group rounded-[5px] border border-[#E0E0E0] bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 font-semibold [&::-webkit-details-marker]:hidden">
        Đội xe và liên hệ
        <span aria-hidden="true" className="text-[#5C636A] transition-transform group-open:rotate-180">▾</span>
      </summary>
      {crew.length === 0 ? (
        <p className="border-t border-[#E0E0E0] px-3 py-3 text-sm text-[#5C636A]">Chưa có thông tin tài xế, phụ xe.</p>
      ) : (
        <ul className="divide-y divide-[#E0E0E0] border-t border-[#E0E0E0] px-3">
          {crew.map((member, index) => (
            <li key={`${member.vehicle.dep_vehicle_id}-${member.role_in_trip}-${index}`} className="flex min-h-12 items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm">{member.role_in_trip === "Driver" ? "Tài xế" : "Phụ xe"} · {member.full_name}</p>
                <p className="font-mono text-xs text-[#5C636A]">{member.vehicle.plate_number}</p>
              </div>
              <a href={telHref(member.phone)} aria-label={`Gọi ${member.full_name}, ${formatPhone(member.phone)}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-[5px] text-[#186734] hover:bg-[#E8F5E9]">
                <Phone aria-hidden="true" className="size-5" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function PassengerGroups({ data, filter, query, canMarkAbsent, onUpdated, onError }: {
  data: ManifestDto; filter: PassengerFilter; query: string; canMarkAbsent: boolean;
  onUpdated: (passenger: ManifestPassengerDto) => void; onError: (outcome: ScanOutcome) => void;
}) {
  if (data.passengers.length === 0) {
    return (
      <EmptyState icon={<UsersRound aria-hidden="true" className="size-10" />} title="Chuyến chưa có hành khách">
        Khi có vé đã thanh toán, hành khách sẽ hiện tại đây.
      </EmptyState>
    );
  }
  const groups = groupByPickup(filterPassengers(data.passengers, filter, query));
  if (groups.length === 0) {
    return (
      <EmptyState icon={<Search aria-hidden="true" className="size-10" />} title="Không có khách phù hợp">
        Thử đổi bộ lọc hoặc từ khóa tìm kiếm.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key} aria-label={`Điểm đón ${group.name}`}>
          <div className="mb-1 flex items-center justify-between gap-2 rounded-[5px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold">Điểm đón: {group.name} · {formatClock(group.pickup_time)}</h3>
              <p className="truncate text-xs text-[#5C636A]">{group.address}</p>
            </div>
            <span className="shrink-0 text-xs font-medium text-[#5C636A]">{group.passengers.length} khách</span>
          </div>
          <ul className="divide-y divide-[#E0E0E0] rounded-[5px] border border-[#E0E0E0] bg-white">
            {group.passengers.map((passenger) => (
              <PassengerRow key={passenger.detail_id} departureId={data.departure.departure_id} passenger={passenger}
                canMarkAbsent={canMarkAbsent} onUpdated={onUpdated} onError={onError} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PassengerRow({ departureId, passenger, canMarkAbsent, onUpdated, onError }: {
  departureId: number; passenger: ManifestPassengerDto; canMarkAbsent: boolean;
  onUpdated: (passenger: ManifestPassengerDto) => void; onError: (outcome: ScanOutcome) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function markAbsent() {
    if (!confirming) { setConfirming(true); return; }
    // A ref guards against a double tap landing before React re-renders the disabled button.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await leaderClient.markAbsent(departureId, passenger.detail_id);
      onUpdated(result.passenger);
    } catch (cause) {
      const error = cause instanceof LeaderClientError ? cause : new LeaderClientError(0, "NETWORK_ERROR", "");
      onError(describeLeaderError(error.code, error.status));
    } finally {
      inFlight.current = false;
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-[4px] border border-[#E0E0E0] bg-[#F8F9FA] px-1.5 py-0.5 font-mono text-xs font-semibold">Ghế {passenger.seat_name}</span>
        <span className="rounded-[4px] bg-[#F5F5F5] px-1.5 py-0.5 font-mono text-xs text-[#5C636A]">{passenger.vehicle.plate_number}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 break-words text-base font-bold leading-snug">{passenger.passenger_name}</p>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <CheckInBadge status={passenger.check_in_status} time={passenger.check_in_time} />
          {canMarkAbsent && passenger.check_in_status === "Pending" && (
            <button type="button" onClick={markAbsent} onBlur={() => { if (!busy) setConfirming(false); }} disabled={busy}
              className={cn("inline-flex min-h-9 items-center gap-1 rounded-[5px] border px-2.5 text-xs font-semibold",
                confirming ? "border-[#C62828] bg-[#C62828] text-white" : "border-[#C62828] bg-white text-[#C62828] hover:bg-[#FFEBEE]")}>
              {busy && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
              {confirming ? "Xác nhận vắng?" : "Báo vắng"}
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <a href={telHref(passenger.passenger_phone)} className="inline-flex min-h-9 items-center gap-1 font-semibold text-[#186734] underline">
          <Phone aria-hidden="true" className="size-4" /> {formatPhone(passenger.passenger_phone)}
        </a>
        <span className="text-xs text-[#5C636A]">Khẩn cấp: {passenger.emergency_contact}</span>
      </div>
    </li>
  );
}
