"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState, type ReactNode } from "react";
import { Boxes, Compass, LayoutDashboard, Menu, ShieldCheck, X } from "lucide-react";

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

export function StaffSupplyShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const role = session?.user?.role;

  const navigation = (
    <nav aria-label="Điều hướng cổng vận hành" className="space-y-1">
      <Link
        href="/staff"
        onClick={() => setMenuOpen(false)}
        className="flex min-h-11 items-center gap-3 px-5 text-sm text-neutral-300 hover:bg-neutral-800"
      >
        <LayoutDashboard aria-hidden="true" className="size-5" />
        Tổng quan vận hành
      </Link>
      <Link
        href="/staff/supplies"
        aria-current="page"
        onClick={() => setMenuOpen(false)}
        className="flex min-h-11 items-center gap-3 border-l-4 border-[#FEBB02] bg-[#1F2937] px-4 text-sm font-bold text-white"
      >
        <Boxes aria-hidden="true" className="size-5" />
        Kho vật tư & cấp chuyến
      </Link>
      {role === "Admin" && (
        <Link
          href="/admin"
          onClick={() => setMenuOpen(false)}
          className="flex min-h-11 items-center gap-3 px-5 text-sm text-neutral-300 hover:bg-neutral-800"
        >
          <ShieldCheck aria-hidden="true" className="size-5" />
          Bảng điều khiển quản trị
        </Link>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#212529] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen flex-col bg-[#111111] text-white lg:flex">
        <Link href="/staff" className="px-6 py-8 text-2xl font-bold text-[#FEBB02]">
          gotrail
        </Link>
        <p className="mb-4 px-6 text-xs text-neutral-400">Cổng vận hành nội bộ</p>
        {navigation}
        <div className="mt-auto border-t border-neutral-700 px-6 py-6 text-sm">
          <p className="font-semibold break-words">
            {session?.user?.name ?? "Tài khoản nội bộ"}
          </p>
          <p className="mt-1 text-xs text-neutral-400">{formatRoleTitle(role)}</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-neutral-300 bg-white px-4 lg:px-8">
          <p className="text-sm font-semibold text-[#5C636A]">
            Go-Trail / Kho vật tư & cấp chuyến
          </p>
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-controls="staff-supply-mobile-menu"
            aria-label={menuOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
            className="flex size-11 shrink-0 items-center justify-center rounded-[5px] border border-[#6B7280] lg:hidden"
          >
            {menuOpen ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
          </button>
        </header>

        <div
          id="staff-supply-mobile-menu"
          hidden={!menuOpen}
          className="bg-[#111111] py-3 text-white lg:hidden"
        >
          {navigation}
        </div>

        <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
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
