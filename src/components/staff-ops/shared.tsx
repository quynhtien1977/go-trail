"use client";

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { errorMessage, type DepartureStatus, type StaffStatus, type VehicleStatus } from "@/lib/staff-ops-client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Data loading: `key` identifies what is loaded; null skips loading. A response that
// arrives after the key changed is ignored, so fast filter/page clicks never show stale rows.
// ---------------------------------------------------------------------------
type ResourceState<T> = { key: string | null; data?: T; error?: string };

export function useResource<T>(key: string | null, load: () => Promise<T>) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ key: null });
  const requestKey = key === null ? null : `${key}#${nonce}`;
  const run = useEffectEvent(() => load());

  useEffect(() => {
    if (requestKey === null) return;
    let alive = true;
    run().then(
      (data) => { if (alive) setState({ key: requestKey, data }); },
      (error) => { if (alive) setState({ key: requestKey, error: errorMessage(error) }); },
    );
    return () => { alive = false; };
  }, [requestKey]);

  const sameBase = state.key !== null && key !== null && state.key.startsWith(`${key}#`);
  return {
    data: sameBase ? state.data : undefined,
    error: state.key === requestKey ? state.error : undefined,
    loading: requestKey !== null && state.key !== requestKey,
    reload: () => setNonce((value) => value + 1),
    /** Replace the loaded value with a fresh server response after a mutation. */
    setData: (data: T) => setState((current) => ({ ...current, key: requestKey, data, error: undefined })),
  };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800/80 dark:bg-zinc-900", className)}>
      {children}
    </section>
  );
}

export function SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h3 className="text-base font-black uppercase text-zinc-950 sm:text-lg dark:text-white">{title}</h3>
        {description && <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function RefreshButton({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <Button type="button" variant="outline" size="icon" onClick={onClick} disabled={loading} aria-label={label} title={label}>
      <RefreshCw className={cn(loading && "animate-spin")} />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Loading / empty / error states
// ---------------------------------------------------------------------------
export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <RefreshCw className="size-6 animate-spin text-[#febb02]" aria-hidden />
      <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">{label}</span>
    </div>
  );
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-sm flex-col items-center justify-center gap-2 py-10 text-center">
      <AlertCircle className="size-8 text-red-500" aria-hidden />
      <span className="text-sm font-bold text-red-900 dark:text-red-200">{title}</span>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{message}</p>
      {onRetry && (
        <Button type="button" size="sm" className="mt-2" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, message, action, icon }: { title: string; message?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-2 py-10 text-center">
      {icon ?? <Inbox className="size-9 text-zinc-300 dark:text-zinc-600" aria-hidden />}
      <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{title}</span>
      {message && <p className="text-xs text-zinc-500 dark:text-zinc-400">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Renders loading, error or empty states, or the children when there is data. */
export function ResourceView<T>({ resource, loadingLabel, errorTitle, isEmpty, empty, children }: {
  resource: { data?: T; error?: string; loading: boolean; reload: () => void };
  loadingLabel: string; errorTitle: string; isEmpty: (data: T) => boolean; empty: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (resource.error) return <ErrorState title={errorTitle} message={resource.error} onRetry={resource.reload} />;
  if (resource.data === undefined) return <LoadingState label={loadingLabel} />;
  if (isEmpty(resource.data)) return <>{empty}</>;
  return <div className={cn("transition-opacity", resource.loading && "opacity-60")} aria-busy={resource.loading}>{children(resource.data)}</div>;
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------
export type NoticeValue = { type: "success" | "error"; text: string; hint?: string } | null;

export function Notice({ notice, onClose }: { notice: NoticeValue; onClose: () => void }) {
  if (!notice) return null;
  const error = notice.type === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "flex items-start justify-between gap-3 rounded-2xl border p-3 text-xs sm:p-4",
        error
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        {error ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
        <div className="min-w-0 space-y-1">
          <p className="font-semibold break-words">{notice.text}</p>
          {notice.hint && <p className="break-words opacity-90">{notice.hint}</p>}
        </div>
      </div>
      <button type="button" onClick={onClose} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Đóng thông báo">
        <X className="size-4" />
      </button>
    </div>
  );
}

export function Pager({ page, totalPages, totalItems, onChange, disabled }: {
  page: number; totalPages: number; totalItems: number; onChange: (page: number) => void; disabled?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3 pt-3 text-xs text-zinc-600 dark:text-zinc-400" aria-label="Phân trang">
      <span>Trang {page}/{totalPages} · {totalItems} mục</span>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="icon-sm" aria-label="Trang trước" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft />
        </Button>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Trang sau" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}>
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Form controls that match components/ui/input
// ---------------------------------------------------------------------------
const controlClass =
  "h-10 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition-all focus-visible:border-[#febb02] focus-visible:ring-3 focus-visible:ring-[#febb02]/25 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:text-zinc-100";

export function FieldLabel({ htmlFor, children, required }: { htmlFor: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
      {children}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
  );
}

export function SelectField({ id, label, value, onChange, options, required, disabled, helperText }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  options: { value: string; label: string }[]; required?: boolean; disabled?: boolean; helperText?: string;
}) {
  return (
    <div className="w-full space-y-1.5">
      <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled} className={controlClass}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {helperText && <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{helperText}</p>}
    </div>
  );
}

export function TextAreaField({ id, label, value, onChange, required, maxLength }: {
  id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean; maxLength?: number;
}) {
  return (
    <div className="w-full space-y-1.5">
      <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
      <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} required={required} maxLength={maxLength} rows={3}
        className={cn(controlClass, "h-auto py-2")} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side drawer (accessible dialog from components/ui/sheet)
// ---------------------------------------------------------------------------
export function Drawer({ open, onClose, title, description, children }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      {/* The site Navbar is fixed at z-[99999]; the drawer and its backdrop must sit above it. */}
      <SheetContent side="right" overlayClassName="z-[100000]"
        className="z-[100001] data-[side=right]:w-full data-[side=right]:sm:max-w-xl gap-0 bg-white dark:bg-zinc-950">
        <SheetHeader className="border-b border-zinc-200 pr-12 dark:border-zinc-800">
          <SheetTitle className="text-base font-black text-zinc-950 dark:text-white">{title}</SheetTitle>
          {description && <SheetDescription className="text-xs text-zinc-500">{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------
const tone = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
  amber: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900",
  blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-900",
  gray: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900",
} as const;

export function Pill({ color, children }: { color: keyof typeof tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-bold", tone[color])}>
      {children}
    </span>
  );
}

export const departureStatusLabel: Record<DepartureStatus, { label: string; color: keyof typeof tone }> = {
  Draft: { label: "Nháp", color: "gray" },
  Open: { label: "Đang mở bán", color: "green" },
  Closed: { label: "Đã đóng bán", color: "amber" },
  Confirmed: { label: "Đã chốt", color: "blue" },
  Running: { label: "Đang chạy", color: "indigo" },
  Ended: { label: "Đã kết thúc", color: "gray" },
  Cancelled: { label: "Đã hủy (dữ liệu cũ)", color: "red" },
  Rescheduled: { label: "Đã dời (dữ liệu cũ)", color: "red" },
};

export const vehicleStatusLabel: Record<VehicleStatus, { label: string; color: keyof typeof tone }> = {
  Ready: { label: "Sẵn sàng", color: "green" },
  Maintenance: { label: "Bảo dưỡng", color: "amber" },
  Inactive: { label: "Ngừng hoạt động", color: "gray" },
};

export const staffStatusLabel: Record<StaffStatus, { label: string; color: keyof typeof tone }> = {
  Active: { label: "Đang làm việc", color: "green" },
  Inactive: { label: "Ngừng hoạt động", color: "gray" },
};

export const crewRoleLabel = { Driver: "Tài xế", Assistant: "Phụ xe", Leader: "Leader" } as const;

export function DepartureStatusPill({ status }: { status: DepartureStatus }) {
  const item = departureStatusLabel[status];
  return <Pill color={item.color}>{item.label}</Pill>;
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/90 dark:border-zinc-800">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">{children}</table>
      </div>
    </div>
  );
}

export const thClass = "bg-zinc-50 px-3 py-3 font-bold uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400";
export const tdClass = "px-3 py-3 align-middle text-zinc-700 dark:text-zinc-300";
