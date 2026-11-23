"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState, type ReactNode } from "react";
import { FileSpreadsheet, LayoutDashboard, Menu, ShieldCheck, X } from "lucide-react";

function formatRoleLabel(role?: string | null): string {
  switch (role) {
    case "RouteMgr":
      return "Quản lý Tuyến & Web";
    case "Admin":
      return "Quản trị viên";
    case "HRMgr":
      return "Quản lý Nhân sự & Đội xe";
    case "Leader":
      return "Leader dẫn đoàn";
    default:
      return "Kiểm tra phiên đăng nhập";
  }
}

export function StaffInvoiceShell({ children }: { children: ReactNode }) {
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
        href="/staff/invoices"
        aria-current="page"
        onClick={() => setMenuOpen(false)}
        className="flex min-h-11 items-center gap-3 border-l-4 border-[#FEBB02] bg-[#1F2937] px-4 text-sm font-bold text-white"
      >
        <FileSpreadsheet aria-hidden="true" className="size-5" />
        Quản lý hóa đơn & vé
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
      <aside className="hidden min-h-screen flex-col bg-[#111111] text-white print:hidden lg:flex">
        <Link href="/staff" className="px-6 py-8 text-2xl font-bold text-[#FEBB02]">
          gotrail
        </Link>
        <p className="mb-4 px-6 text-xs text-neutral-400">Cổng vận hành nội bộ</p>
        {navigation}
        <div className="mt-auto border-t border-neutral-700 px-6 py-6 text-sm">
          <p className="font-semibold break-words">
            {session?.user?.name ?? "Tài khoản nội bộ"}
          </p>
          <p className="mt-1 text-xs text-neutral-400">{formatRoleLabel(role)}</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-neutral-300 bg-white px-4 print:hidden lg:px-8">
          <p className="text-sm font-semibold text-[#5C636A]">
            Go-Trail / Quản lý hóa đơn và vé theo chuyến
          </p>
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-controls="staff-invoice-mobile-menu"
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
          id="staff-invoice-mobile-menu"
          hidden={!menuOpen}
          className="bg-[#111111] py-3 text-white print:hidden lg:hidden"
        >
          {navigation}
        </div>

        <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
