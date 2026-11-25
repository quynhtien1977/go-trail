"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { Boxes, Compass } from "lucide-react";

// The staff/admin supply page uses the shared BackOfficeShell; only the Leader portal keeps its own shell.
function formatRoleTitle(role?: string | null): string {
  switch (role) {
    case "HRMgr":
      return "Quản lý Nhân sự & Đội xe";
    case "RouteMgr":
      return "Quản lý Tuyến & Web";
    case "Admin":
      return "Quản trị viên";
    case "Leader":
      return "Leader dẫn đoàn";
    default:
      return "Kiểm tra phiên đăng nhập";
  }
}

export function LeaderSupplyShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20 text-[#212529]">
      <header className="border-b border-neutral-300 bg-[#111111] px-4 py-4 text-white sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#FEBB02]">Cổng điều hành dẫn đoàn</p>
            <p className="mt-0.5 text-base font-bold">Vật tư chuyến được phân công</p>
          </div>
          <div className="text-right text-xs text-neutral-300">
            <p className="font-semibold text-white">{session?.user?.name ?? "Leader"}</p>
            <p>{formatRoleTitle(session?.user?.role)}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</main>

      <nav
        aria-label="Điều hướng cổng Leader"
        className="fixed inset-x-0 bottom-0 z-20 flex h-[60px] items-center justify-around border-t border-neutral-800 bg-[#111111] px-2 text-xs text-neutral-300"
      >
        <Link
          href="/leader"
          className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-[5px] hover:text-white"
        >
          <Compass aria-hidden="true" className="size-4" />
          <span>Chuyến đi</span>
        </Link>
        <Link
          href="/leader/supplies"
          aria-current="page"
          className="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-[5px] font-bold text-[#FEBB02]"
        >
          <Boxes aria-hidden="true" className="size-4" />
          <span>Vật tư chuyến</span>
        </Link>
      </nav>
    </div>
  );
}
