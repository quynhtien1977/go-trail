"use client";

import { useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle, Flag, Loader2, X } from "lucide-react";
import type { ManifestDto } from "@/schemas/checkin";
import { cn } from "@/lib/utils";
import { LeaderClientError, describeLeaderError, formatDepartureDate, leaderClient, type ScanOutcome } from "@/lib/leader-ui";
import { Notice, buttonBase, buttonOutline } from "./leader-ui-parts";

// L02 end-of-trip confirmation. The server call is idempotent (a retry returns changed=false),
// and the ref stops a double tap from sending twice before the button disables.
export function EndDepartureDialog({ manifest, onClose, onEnded }: {
  manifest: ManifestDto;
  onClose: () => void;
  onEnded: (outcome: ScanOutcome) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ScanOutcome | null>(null);
  const inFlight = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { departure, summary } = manifest;

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await leaderClient.endDeparture(departure.departure_id);
      onEnded({ tone: "success", title: result.changed ? "Đã kết thúc chuyến" : "Chuyến đã được kết thúc trước đó" });
    } catch (cause) {
      const failure = cause instanceof LeaderClientError ? cause : new LeaderClientError(0, "NETWORK_ERROR", "");
      setError(describeLeaderError(failure.code, failure.status));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const unfinished = summary.pending + summary.absent;
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !inFlight.current) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup initialFocus={cancelRef}
          className="fixed inset-x-0 bottom-0 z-[51] max-h-[90dvh] overflow-y-auto rounded-t-[8px] border border-[#E0E0E0] bg-white pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[8px]">
        <div className="flex items-center justify-between gap-2 border-b border-[#E0E0E0] px-4 py-3">
          <Dialog.Title className="flex items-center gap-2 text-lg font-bold">
            <AlertTriangle aria-hidden="true" className="size-5 text-[#C62828]" /> Xác nhận kết thúc chuyến
          </Dialog.Title>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng"
            className="flex size-11 items-center justify-center rounded-[5px] text-[#5C636A] hover:bg-neutral-100">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <p className="font-bold">{departure.trip_name}</p>
            <p className="text-sm text-[#5C636A]">#{departure.departure_id} · Khởi hành {formatDepartureDate(departure.departure_date)}</p>
          </div>

          <dl className="grid grid-cols-4 divide-x divide-[#E0E0E0] rounded-[5px] border border-[#E0E0E0] py-2 text-center">
            {[
              { label: "Tổng", value: summary.total, className: "text-[#212529]" },
              { label: "Đã check-in", value: summary.checked_in, className: "text-[#186734]" },
              { label: "Chưa đến", value: summary.pending, className: "text-[#8A5A00]" },
              { label: "Vắng", value: summary.absent, className: "text-[#C62828]" },
            ].map((tile) => (
              <div key={tile.label} className="px-1">
                <dt className={cn("text-xs font-semibold leading-tight", tile.className)}>{tile.label}</dt>
                <dd className={cn("text-lg font-bold tabular-nums", tile.className)}>{tile.value}</dd>
              </div>
            ))}
          </dl>

          {unfinished > 0 ? (
            <Notice tone="warning" title="Còn khách chưa check-in">
              Vẫn còn {summary.pending} khách chưa đến và {summary.absent} khách vắng. Sau khi kết thúc, không thể check-in hay báo vắng nữa.
            </Notice>
          ) : (
            <p className="text-sm text-[#212529]">Tất cả khách đã check-in. Sau khi kết thúc, danh sách chỉ còn để xem.</p>
          )}
          {error && <Notice tone={error.tone} title={error.title}>{error.detail}</Notice>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#E0E0E0] p-4 sm:flex-row">
          <button ref={cancelRef} type="button" onClick={onClose} disabled={busy} className={cn(buttonOutline, "flex-1")}>
            Quay lại kiểm tra
          </button>
          <button type="button" onClick={confirm} disabled={busy} className={cn(buttonBase, "flex-1 bg-[#C62828] text-white hover:bg-[#A61F1F]")}>
            {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Flag aria-hidden="true" className="size-4" />}
            {busy ? "Đang kết thúc…" : "Xác nhận kết thúc"}
          </button>
        </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
