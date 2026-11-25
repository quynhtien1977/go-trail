// Shared by server pages and client components: no hooks, no "use client", so the class-name
// constants below stay plain strings on both sides.
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Info, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { departureStatusLabel, formatClock, type CheckInStatus, type LeaderDepartureStatus, type Tone } from "@/lib/leader-ui";

// Semantic colours from DESIGN.md 2.2 (all WCAG AA).
export const toneClass: Record<Tone, string> = {
  success: "border-[#186734] bg-[#E8F5E9] text-[#186734]",
  warning: "border-[#8A5A00] bg-[#FFF8E1] text-[#8A5A00]",
  danger: "border-[#C62828] bg-[#FFEBEE] text-[#C62828]",
  neutral: "border-[#616161] bg-[#F5F5F5] text-[#616161]",
};

const departureTone: Record<LeaderDepartureStatus, string> = {
  Confirmed: "bg-[#FFF8E1] text-[#8A5A00]",
  Running: "bg-[#E8F5E9] text-[#186734]",
  Ended: "bg-[#F5F5F5] text-[#616161]",
};

export function DepartureStatusBadge({ status }: { status: string }) {
  const known = status in departureStatusLabel ? (status as LeaderDepartureStatus) : null;
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-[5px] px-2 py-1 text-xs font-semibold",
      known ? departureTone[known] : "bg-[#F5F5F5] text-[#616161]")}>
      {known ? departureStatusLabel[known] : status}
    </span>
  );
}

export function CheckInBadge({ status, time }: { status: CheckInStatus; time: string | null }) {
  if (status === "CheckedIn") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] bg-[#E8F5E9] px-2 py-1 text-xs font-semibold text-[#186734]">
        <CheckCircle2 aria-hidden="true" className="size-4" />
        {time ? `Đã check-in lúc ${formatClock(time)}` : "Đã check-in"}
      </span>
    );
  }
  if (status === "Absent") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] bg-[#FFEBEE] px-2 py-1 text-xs font-semibold text-[#C62828]">
        <XCircle aria-hidden="true" className="size-4" />
        Đã đánh dấu vắng
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] bg-[#FFF8E1] px-2 py-1 text-xs font-semibold text-[#8A5A00]">
      <Clock3 aria-hidden="true" className="size-4" />
      Chưa đến
    </span>
  );
}

export function Notice({ tone, title, children, action }: { tone: Tone; title: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertTriangle : tone === "danger" ? XCircle : Info;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-[5px] border p-3", toneClass[tone])}>
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{title}</p>
        {children && <div className="mt-1 text-sm text-[#212529]">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

// Neutral empty state (DESIGN.md rule 5): no warning colours, one next step.
export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[5px] border border-dashed border-[#CCCCCC] bg-white px-4 py-10 text-center">
      <div className="mx-auto flex size-12 items-center justify-center text-[#5C636A]">{icon}</div>
      <p className="mt-3 font-bold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-[#5C636A]">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-2 text-sm text-[#5C636A]">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" /> {label}
      </div>
      {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-[5px] border border-[#E0E0E0] bg-white" />)}
    </div>
  );
}

export const buttonBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#186734] disabled:cursor-not-allowed disabled:opacity-60";
export const buttonYellow = cn(buttonBase, "bg-[#FEBB02] text-black hover:bg-[#E5A800]");
export const buttonGreen = cn(buttonBase, "bg-[#186734] text-white hover:bg-[#125228]");
export const buttonOutline = cn(buttonBase, "border border-[#6B7280] bg-white text-[#212529] hover:bg-neutral-50");
export const buttonOutlineGreen = cn(buttonBase, "border border-[#186734] bg-white text-[#186734] hover:bg-[#E8F5E9]");
export const buttonOutlineDanger = cn(buttonBase, "border border-[#C62828] bg-white text-[#C62828] hover:bg-[#FFEBEE]");
