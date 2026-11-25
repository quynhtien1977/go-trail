"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Loader2, X, XCircle } from "lucide-react";
import type { Role } from "@/schemas/auth";
import { cn } from "@/lib/utils";
import { PAGE_SIZES, ROLE_LABELS, STATUS_LABELS, formatCount, initials, type AccountStatus, type Tone } from "@/lib/customer-account-ui";

export const toneClass: Record<Tone, string> = {
  success: "bg-[#E8F5E9] text-[#186734]",
  warning: "bg-[#FFF8E1] text-[#8A5A00]",
  neutral: "bg-[#F5F5F5] text-[#616161]",
  danger: "bg-[#FFEBEE] text-[#C62828]",
};

export function Tag({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-[5px] px-2 py-0.5 text-xs font-semibold", toneClass[tone], className)}>{children}</span>;
}

export function StatusTag({ status }: { status: AccountStatus }) {
  return <Tag tone={status === "Active" ? "success" : "danger"}>{STATUS_LABELS[status]}</Tag>;
}

const roleClass: Record<Role, string> = {
  Customer: "bg-[#F5F5F5] text-[#212529]",
  Leader: "bg-[#E8F5E9] text-[#186734]",
  RouteMgr: "bg-[#FFF8E1] text-[#8A5A00]",
  HRMgr: "border border-[#6B7280] bg-[#F5F5F5] text-[#212529]",
  Admin: "bg-[#212529] text-white",
};
export function RoleTag({ role }: { role: Role }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-[5px] px-2 py-0.5 text-xs font-semibold", roleClass[role])}>{ROLE_LABELS[role]}</span>;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center rounded-[5px] bg-[#F5F5F5] font-bold text-[#212529]",
      size === "lg" ? "size-10 text-sm" : "size-8 text-xs")}>{initials(name)}</span>
  );
}

export function Notice({ tone, title, children, action }: { tone: "danger" | "warning" | "info"; title: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === "danger" ? XCircle : tone === "warning" ? AlertTriangle : Info;
  const palette = tone === "danger" ? "border-[#C62828]/30 bg-[#FFEBEE] text-[#C62828]"
    : tone === "warning" ? "border-[#8A5A00]/30 bg-[#FFF8E1] text-[#8A5A00]" : "border-[#E0E0E0] bg-[#F8F9FA] text-[#212529]";
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-[5px] border p-3", palette)}>
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold">{title}</p>
        {children && <div className="mt-1 text-[#212529]">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export const buttonBase = "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#186734] disabled:cursor-not-allowed disabled:opacity-60";
export const buttonOutline = cn(buttonBase, "border border-[#E0E0E0] bg-white text-[#212529] hover:bg-neutral-50");
export const buttonOutlineDanger = cn(buttonBase, "border border-[#C62828]/40 bg-white text-[#C62828] hover:bg-[#FFEBEE]");
export const buttonOutlineGreen = cn(buttonBase, "border border-[#186734]/40 bg-white text-[#186734] hover:bg-[#E8F5E9]");
export const buttonYellow = cn(buttonBase, "bg-[#FEBB02] font-bold text-black hover:bg-[#E5A800]");
export const buttonDanger = cn(buttonBase, "bg-[#C62828] font-bold text-white hover:bg-[#A61F1F]");
export const buttonGreen = cn(buttonBase, "bg-[#186734] font-bold text-white hover:bg-[#125228]");
export const smallButton = "min-h-9 px-3 text-xs";

export function StatTile({ label, value, tone }: { label: string; value: number | null; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-[5px] border border-[#E0E0E0] bg-white p-4">
      <p className="text-sm font-medium text-[#5C636A]">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone === "success" ? "text-[#186734]" : tone === "danger" ? "text-[#C62828]" : "text-[#212529]")}>
        {value === null ? <span className="inline-block h-7 w-16 animate-pulse rounded-[5px] bg-neutral-200" /> : formatCount(value)}
      </p>
    </div>
  );
}

export function Pagination({ page, totalPages, totalItems, pageSize, noun, onPage, onPageSize }: {
  page: number; totalPages: number; totalItems: number; pageSize: number; noun: string;
  onPage: (page: number) => void; onPageSize: (size: number) => void;
}) {
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  return (
    <div className="flex flex-col gap-3 border-t border-[#E0E0E0] px-4 py-3 text-sm text-[#5C636A] sm:flex-row sm:items-center sm:justify-between">
      <p>Hiển thị <span className="font-semibold text-[#212529]">{from}–{to}</span> / {formatCount(totalItems)} {noun}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span>Số dòng:</span>
          <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}
            className="h-9 rounded-[5px] border border-[#E0E0E0] bg-white px-2 text-[#212529]">
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} / trang</option>)}
          </select>
        </label>
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Trang trước" className={cn(buttonOutline, "min-h-9 px-2")}>
          <ChevronLeft aria-hidden="true" className="size-4" /> Trước
        </button>
        <span className="min-w-16 text-center text-[#212529]">Trang {page} / {Math.max(1, totalPages)}</span>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Trang sau" className={cn(buttonOutline, "min-h-9 px-2")}>
          Sau <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}

// Locks page scroll while an overlay is open. The removed scrollbar's width is added back as padding,
// so the page behind the overlay does not shift sideways when it opens or closes.
let overlayDepth = 0;
function useOverlay(onClose: () => void, locked: boolean) {
  const close = useEffectEvent(() => { if (!locked) onClose(); });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const body = document.body;
    const previous = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    if (overlayDepth === 0) {
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbar > 0) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbar}px`;
      body.style.overflow = "hidden";
    }
    overlayDepth += 1;
    return () => {
      document.removeEventListener("keydown", onKey);
      overlayDepth -= 1;
      if (overlayDepth === 0) { body.style.overflow = previous.overflow; body.style.paddingRight = previous.paddingRight; }
    };
  }, []);
}

// Right drawer on desktop, bottom sheet on mobile (Stitch C04 detail screens).
export function Drawer({ title, onClose, children, footer, labelledBy }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; labelledBy: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useOverlay(onClose, false);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 duration-200 animate-in fade-in motion-reduce:animate-none md:items-stretch md:justify-end"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        className="flex max-h-[88dvh] w-full flex-col rounded-t-[8px] border border-[#E0E0E0] bg-white duration-200 ease-out animate-in slide-in-from-bottom motion-reduce:animate-none md:max-h-none md:w-[440px] md:rounded-none md:border-y-0 md:border-r-0 md:slide-in-from-bottom-0 md:slide-in-from-right">
        <div className="flex items-start justify-between gap-3 border-b border-[#E0E0E0] p-4">
          <div className="min-w-0 flex-1">{title}</div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng" className="flex size-11 shrink-0 items-center justify-center rounded-[5px] text-[#5C636A] hover:bg-neutral-100">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-[#E0E0E0] bg-[#F8F9FA] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Dialog({ title, onClose, children, actions, busy, labelledBy }: {
  title: ReactNode; onClose: () => void; children: ReactNode; actions: ReactNode; busy: boolean; labelledBy: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlay(onClose, busy);
  useEffect(() => { panelRef.current?.querySelector<HTMLElement>("button, input")?.focus(); }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 duration-150 animate-in fade-in motion-reduce:animate-none sm:items-center sm:p-4"
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-[8px] border border-[#E0E0E0] bg-white duration-200 ease-out animate-in slide-in-from-bottom motion-reduce:animate-none sm:max-w-[480px] sm:rounded-[8px] sm:slide-in-from-bottom-0 sm:zoom-in-95">
        <div className="flex items-center justify-between gap-2 border-b border-[#E0E0E0] px-5 py-3">
          <h2 id={labelledBy} className="flex items-center gap-2 text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng" className="flex size-11 items-center justify-center rounded-[5px] text-[#5C636A] hover:bg-neutral-100">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
        <div className="flex flex-col-reverse gap-2 border-t border-[#E0E0E0] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">{actions}</div>
      </div>
    </div>
  );
}

export function Spinner() { return <Loader2 aria-hidden="true" className="size-4 animate-spin" />; }

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Đang tải" className="divide-y divide-[#E0E0E0]">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-4">
          <span className="size-8 animate-pulse rounded-[5px] bg-neutral-200" />
          <span className="h-4 flex-1 animate-pulse rounded-[5px] bg-neutral-200" />
          <span className="hidden h-4 w-24 animate-pulse rounded-[5px] bg-neutral-200 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function EmptyBlock({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center">
      <div className="mx-auto flex size-12 items-center justify-center text-[#5C636A]">{icon}</div>
      <p className="mt-3 font-bold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-[#5C636A]">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
