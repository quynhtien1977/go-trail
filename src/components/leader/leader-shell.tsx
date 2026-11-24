"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, Footprints, QrCode, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

// Leader shell (DESIGN.md 8.4): mobile-first, black top bar, fixed 3-tab bottom navigation.
// Content widens on tablet/desktop but stays a single readable column for outdoor use.
export const leaderContainer = "mx-auto w-full max-w-[600px] px-4 md:max-w-3xl md:px-6 lg:max-w-5xl";

type TopBar =
  | { kind: "brand" }
  | { kind: "detail"; title: string; subtitle?: string; backHref: string; backLabel?: string; aside?: ReactNode };

export function LeaderShell({ topBar, scanHref = "/leader/scan", children, footer }: {
  topBar: TopBar;
  scanHref?: string;
  children: ReactNode;
  // Sticky action area kept above the bottom navigation (e.g. the manifest CTAs).
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#F8F9FA] text-[#212529]">
      <header className="sticky top-0 z-40 bg-black pt-[env(safe-area-inset-top)] text-white">
        <div className={cn(leaderContainer, "flex h-14 items-center justify-between gap-3")}>
          {topBar.kind === "brand" ? (
            <>
              <Link href="/leader" className="text-lg font-bold text-[#FEBB02]">Go-Trail</Link>
              <span className="rounded-[5px] border border-neutral-600 px-2 py-1 text-xs font-semibold">Leader</span>
            </>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-1">
                <Link href={topBar.backHref} aria-label={topBar.backLabel ?? "Quay lại"}
                  className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-[5px] hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-[#FEBB02]">
                  <ArrowLeft aria-hidden="true" className="size-6" />
                </Link>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-bold leading-tight sm:text-lg">{topBar.title}</h1>
                  {topBar.subtitle && <p className="truncate text-xs text-neutral-300 sm:text-sm">{topBar.subtitle}</p>}
                </div>
              </div>
              {topBar.aside && <div className="shrink-0">{topBar.aside}</div>}
            </>
          )}
        </div>
      </header>

      <main className={cn(leaderContainer, "flex-1 py-4 md:py-6", footer ? "pb-4" : "pb-[calc(76px+env(safe-area-inset-bottom))]")}>
        {children}
      </main>

      {footer && (
        <div className="sticky bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 border-t border-[#E0E0E0] bg-[#F8F9FA] py-3 mb-[calc(60px+env(safe-area-inset-bottom))]">
          <div className={leaderContainer}>{footer}</div>
        </div>
      )}

      <LeaderBottomNav scanHref={scanHref} />
    </div>
  );
}

function LeaderBottomNav({ scanHref }: { scanHref: string }) {
  const pathname = usePathname() ?? "";
  const tabs = [
    { href: "/leader", label: "Chuyến đi", icon: Footprints,
      active: pathname === "/leader" || (pathname.startsWith("/leader/departures") && !pathname.endsWith("/scan")) },
    { href: scanHref, label: "Quét QR", icon: QrCode, active: pathname === "/leader/scan" || pathname.endsWith("/scan") },
    { href: "/leader/account", label: "Tài khoản", icon: UserRound, active: pathname.startsWith("/leader/account") },
  ];
  return (
    <nav aria-label="Điều hướng Leader" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E0E0E0] bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className={cn(leaderContainer, "grid h-[60px] grid-cols-3")}>
        {tabs.map(({ href, label, icon: Icon, active }) => (
          <li key={label} className="flex">
            <Link href={href} aria-current={active ? "page" : undefined}
              className={cn("flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                active ? "font-bold text-[#186734]" : "text-[#5C636A] hover:text-[#212529]")}>
              <Icon aria-hidden="true" className="size-6" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
