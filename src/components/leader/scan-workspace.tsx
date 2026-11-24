"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { History, Keyboard, Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LeaderClientError, ScanDebouncer, describeCheckInResult, describeLeaderError, formatClock, formatDepartureDate,
  isRetryable, leaderClient, normalizeTicketCode, type ScanOutcome,
} from "@/lib/leader-ui";
import { LeaderShell } from "./leader-shell";
import { EmptyState, LoadingBlock, Notice, buttonOutline, buttonYellow, toneClass } from "./leader-ui-parts";
import { QrScanner } from "./qr-scanner";
import { useManifest } from "./use-manifest";

type Attempt = { id: number; code: string; at: string; outcome: ScanOutcome; retryable: boolean };

export function ScanWorkspace({ departureId }: { departureId: number }) {
  const { state, reload, applyUpdate } = useManifest(departureId);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [current, setCurrent] = useState<Attempt | null>(null);
  const [history, setHistory] = useState<Attempt[]>([]);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const debouncer = useRef(new ScanDebouncer());
  const nextId = useRef(1);
  const manifestHref = `/leader/departures/${departureId}`;
  const data = state.data;

  const topBar = {
    kind: "detail" as const,
    backHref: manifestHref,
    backLabel: "Về danh sách khách",
    title: "Quét QR check-in",
    subtitle: data ? `${data.departure.trip_name} · #${departureId}` : `Mã chuyến #${departureId}`,
    aside: data ? (
      <span className="rounded-[5px] border border-neutral-600 px-2 py-1 text-sm font-bold tabular-nums" aria-label={`Đã check-in ${data.summary.checked_in} trên ${data.summary.total} khách`}>
        <span className="text-[#8BD899]">{data.summary.checked_in}</span>/{data.summary.total}
      </span>
    ) : undefined,
  };

  function record(code: string, outcome: ScanOutcome, retryable: boolean) {
    const attempt: Attempt = { id: nextId.current++, code, at: new Date().toISOString(), outcome, retryable };
    setCurrent(attempt);
    setHistory((items) => [attempt, ...items].slice(0, 8));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(outcome.tone === "success" ? 80 : [60, 60, 60]);
    }
  }

  // Single entry point for camera and typed codes. The ref blocks a second request while one is pending;
  // the server also treats a repeated scan as a stable success, so a retry can never double check-in.
  async function submit(raw: string, source: "camera" | "manual"): Promise<boolean> {
    const code = normalizeTicketCode(raw);
    if (!code) {
      if (source === "camera" && !debouncer.current.accept(raw, Date.now())) return false;
      record(raw.slice(0, 24), describeLeaderError("INVALID_QR", 422), false);
      return false;
    }
    if (inFlight.current) return false;
    if (source === "camera" && !debouncer.current.accept(code, Date.now())) return false;
    inFlight.current = true;
    setVerifying(code);
    try {
      const result = await leaderClient.checkIn(departureId, code);
      applyUpdate(result.passenger);
      record(code, describeCheckInResult(result), false);
      return true;
    } catch (cause) {
      const error = cause instanceof LeaderClientError ? cause : new LeaderClientError(0, "NETWORK_ERROR", "");
      record(code, describeLeaderError(error.code, error.status), isRetryable(error.code, error.status));
      // Let the same QR be read again right away when the failure was transient.
      if (isRetryable(error.code, error.status)) debouncer.current.reset();
      if (error.code === "CHECKIN_CLOSED") reload();
      return false;
    } finally {
      inFlight.current = false;
      setVerifying(null);
    }
  }

  async function onManualSubmit(event: FormEvent) {
    event.preventDefault();
    if (!manual.trim()) { setManualError("Nhập mã vé trước khi bấm Check-in."); return; }
    if (!normalizeTicketCode(manual)) { setManualError("Mã vé chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới."); return; }
    setManualError(null);
    if (await submit(manual, "manual")) setManual("");
  }

  if (!data) {
    return (
      <LeaderShell topBar={topBar} scanHref={`${manifestHref}/scan`}>
        {state.phase === "error" ? (
          state.status === 404 || state.status === 403 ? (
            <EmptyState icon={<X aria-hidden="true" className="size-10" />} title="Không mở được chuyến này"
              action={<Link href="/leader" className={buttonOutline}>Về danh sách chuyến</Link>}>
              Chuyến không tồn tại hoặc không còn được phân công cho bạn.
            </EmptyState>
          ) : (
            <Notice tone="danger" title="Không tải được thông tin chuyến"
              action={<button type="button" onClick={reload} className={buttonOutline}>Thử lại</button>}>
              {describeLeaderError(state.code, state.status).detail}
            </Notice>
          )
        ) : <LoadingBlock label="Đang chuẩn bị quét…" />}
      </LeaderShell>
    );
  }

  if (!data.departure.check_in_open) {
    return (
      <LeaderShell topBar={topBar} scanHref={`${manifestHref}/scan`}>
        <Notice tone="neutral" title="Chuyến đã kết thúc"
          action={<Link href={manifestHref} className={buttonOutline}>Xem danh sách khách</Link>}>
          Không thể check-in cho chuyến {data.departure.trip_name} ({formatDepartureDate(data.departure.departure_date)}) nữa.
        </Notice>
      </LeaderShell>
    );
  }

  return (
    <LeaderShell topBar={topBar} scanHref={`${manifestHref}/scan`}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start md:gap-6">
        <section aria-label="Camera quét mã" className="rounded-[5px] border border-[#E0E0E0] bg-white p-3 md:sticky md:top-20">
          <QrScanner onDetected={(text) => { void submit(text, "camera"); }} disabled={verifying !== null} />
        </section>

        <div className="space-y-4">
          <div aria-live="assertive" aria-atomic="true">
            {verifying ? (
              <div role="status" className="flex items-center gap-3 rounded-[5px] border border-[#E0E0E0] bg-white p-3">
                <Loader2 aria-hidden="true" className="size-5 animate-spin text-[#186734]" />
                <span>Đang kiểm tra mã <span className="font-mono font-semibold">{verifying}</span>…</span>
              </div>
            ) : current ? (
              <ResultCard attempt={current} onRetry={() => { void submit(current.code, "manual"); }} />
            ) : (
              <div className="rounded-[5px] border border-dashed border-[#CCCCCC] bg-white p-3 text-center text-sm text-[#5C636A]">
                Sẵn sàng quét mã QR trên vé của khách.
              </div>
            )}
          </div>

          <form onSubmit={onManualSubmit} noValidate className="space-y-2 rounded-[5px] border border-[#E0E0E0] bg-white p-3">
            <h2 className="flex items-center gap-2 font-bold"><Keyboard aria-hidden="true" className="size-5 text-[#186734]" /> Nhập mã vé</h2>
            <p id="manual-help" className="text-sm text-[#5C636A]">Dùng khi camera không đọc được mã hoặc không mở được camera.</p>
            <div className="flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Mã vé</span>
                <input value={manual} onChange={(event) => { setManual(event.target.value.toUpperCase()); setManualError(null); }}
                  maxLength={64} autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="go"
                  placeholder="VD: TK3F9A…" aria-describedby="manual-help manual-error" aria-invalid={manualError ? true : undefined}
                  className={cn("h-12 w-full rounded-[5px] border bg-white pl-3 pr-10 font-mono text-base font-semibold uppercase tracking-wide placeholder:font-normal placeholder:text-[#5C636A] focus:outline-2 focus:outline-[#186734]",
                    manualError ? "border-[#C62828]" : "border-[#6B7280]")} />
                {manual && (
                  <button type="button" onClick={() => { setManual(""); setManualError(null); }} aria-label="Xóa mã đã nhập"
                    className="absolute right-0 top-0 flex size-12 items-center justify-center text-[#5C636A]">
                    <X aria-hidden="true" className="size-4" />
                  </button>
                )}
              </label>
              <button type="submit" disabled={verifying !== null} className={cn(buttonYellow, "min-h-12 shrink-0")}>Check-in</button>
            </div>
            <p id="manual-error" role={manualError ? "alert" : undefined} className="min-h-5 text-sm text-[#C62828]">{manualError}</p>
          </form>

          {history.length > 1 && (
            <section aria-label="Lượt quét gần đây" className="rounded-[5px] border border-[#E0E0E0] bg-white">
              <h2 className="flex items-center gap-2 border-b border-[#E0E0E0] px-3 py-2 text-sm font-bold">
                <History aria-hidden="true" className="size-4" /> Lượt quét gần đây
              </h2>
              <ul className="divide-y divide-[#E0E0E0]">
                {history.slice(1).map((attempt) => (
                  <li key={attempt.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{attempt.outcome.passenger?.passenger_name ?? <span className="font-mono">{attempt.code}</span>}</span>
                    <span className={cn("shrink-0 rounded-[5px] border px-2 py-0.5 text-xs font-semibold", toneClass[attempt.outcome.tone])}>
                      {attempt.outcome.title} · {formatClock(attempt.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Link href={manifestHref} className={cn(buttonOutline, "w-full")}>Xem danh sách khách</Link>
        </div>
      </div>
    </LeaderShell>
  );
}

function ResultCard({ attempt, onRetry }: { attempt: Attempt; onRetry: () => void }) {
  const { outcome } = attempt;
  const passenger = outcome.passenger;
  return (
    <Notice tone={outcome.tone} title={outcome.title}
      action={attempt.retryable ? (
        <button type="button" onClick={onRetry} className={buttonOutline}><RotateCcw aria-hidden="true" className="size-4" /> Thử lại</button>
      ) : undefined}>
      {passenger ? (
        <div className="space-y-0.5">
          <p className="text-base font-bold text-[#212529]">{passenger.passenger_name} · Ghế {passenger.seat_name}</p>
          <p className="text-sm text-[#5C636A]">
            <span className="font-mono">{passenger.vehicle.plate_number}</span> · Điểm đón {passenger.pickup.name} ({formatClock(passenger.pickup.pickup_time)})
          </p>
          {outcome.detail && <p className="text-sm">{outcome.detail}</p>}
        </div>
      ) : (
        <div className="space-y-0.5">
          {outcome.detail && <p>{outcome.detail}</p>}
          <p className="text-xs text-[#5C636A]">Mã: <span className="break-all font-mono">{attempt.code}</span></p>
        </div>
      )}
    </Notice>
  );
}
