"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useState, type ReactNode } from "react";
import { Boxes, ClipboardCheck, Compass, History, IdCard, LayoutDashboard, LogOut, Menu, ReceiptText, Settings, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials, roleLabel } from "@/lib/customer-account-ui";

export type BackOfficeSection = "overview" | "customers" | "accounts" | "invoices" | "reconciliation" | "supplies" | "settings" | "audit";

// Visibility mirrors the route groups and API roles (PRD 3.2); the server still re-checks every request.
export function backOfficeNavigation(role: string | null | undefined) {
  const isAdmin = role === "Admin";
  const isRouteMgr = role === "RouteMgr";
  return [
    { key: "overview", href: isAdmin ? "/admin" : "/staff", label: "Tổng quan", icon: LayoutDashboard, show: true },
    { key: "customers", href: "/staff/customers", label: "Khách hàng", icon: Users, show: isAdmin || isRouteMgr },
    { key: "accounts", href: "/admin/accounts", label: "Tài khoản", icon: IdCard, show: isAdmin },
    { key: "invoices", href: "/staff/invoices", label: "Hóa đơn & vé", icon: ReceiptText, show: isAdmin || isRouteMgr },
    { key: "reconciliation", href: "/admin/reconciliation", label: "Đối soát thanh toán", icon: ClipboardCheck, show: isAdmin },
    { key: "supplies", href: "/staff/supplies", label: isRouteMgr ? "Vật tư theo chuyến" : "Kho vật tư", icon: Boxes,
      show: isAdmin || isRouteMgr || role === "HRMgr" },
    { key: "audit", href: "/admin/audit", label: "Nhật ký hoạt động", icon: History, show: isAdmin },
    { key: "settings", href: "/admin/settings", label: "Cấu hình", icon: Settings, show: isAdmin },
  ].filter((item) => item.show) as { key: BackOfficeSection; href: string; label: string; icon: typeof Users }[];
}

// The single back-office shell (DESIGN.md 8.4, 8.6): solid #111111 sidebar on desktop, drawer menu on mobile.
// Every /staff and /admin page uses it, so the menu never changes between modules — only the highlighted item.
export function BackOfficeShell({ active, title, children }: { active: BackOfficeSection; title: string; children: ReactNode }) {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const role = session?.user?.role;
  const name = session?.user?.name ?? "Tài khoản nội bộ";
  const items = backOfficeNavigation(role);

  const navigation = (
    <nav aria-label="Điều hướng quản trị" className="space-y-1 px-3">
      {items.map(({ key, href, label, icon: Icon }) => {
        const current = key === active;
        return (
          <Link key={key} href={href} aria-current={current ? "page" : undefined} onClick={() => setMenuOpen(false)}
            className={cn("flex min-h-11 items-center gap-3 rounded-[5px] px-3 text-sm",
              current ? "border-l-4 border-[#FEBB02] bg-[#1F2937] pl-2 font-bold text-white" : "text-[#9CA3AF] hover:bg-neutral-800 hover:text-white")}>
            <Icon aria-hidden="true" className={cn("size-5 shrink-0", current && "text-[#FEBB02]")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const account = (
    <div className="border-t border-neutral-800 px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[5px] bg-[#F5F5F5] text-xs font-bold text-[#212529]">{initials(name)}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          {role && <span className="mt-0.5 inline-block rounded-[5px] bg-[#374151] px-1.5 py-0.5 text-xs text-neutral-200">{roleLabel(role)}</span>}
        </div>
      </div>
      <button type="button" onClick={() => signOut({ callbackUrl: "/staff/login" })}
        className="mt-3 flex min-h-11 items-center gap-2 text-sm text-[#9CA3AF] hover:text-white">
        <LogOut aria-hidden="true" className="size-4" /> Đăng xuất
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[#F8F9FA] text-[#212529] lg:grid lg:grid-cols-[240px_minmax(0,1fr)] print:block">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-[#111111] print:hidden lg:flex">
        <Link href={role === "Admin" ? "/admin" : "/staff"} className="flex h-16 items-center gap-2 border-b border-neutral-800 px-5 text-xl font-bold text-[#FEBB02]">
          <Compass aria-hidden="true" className="size-6" /> Go-Trail
        </Link>
        <div className="flex-1 overflow-y-auto py-4">{navigation}</div>
        {account}
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-[#111111] px-4 text-white print:hidden lg:hidden">
          <button type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-controls="back-office-menu"
            aria-label={menuOpen ? "Đóng menu" : "Mở menu"} className="-ml-2 flex size-11 items-center justify-center rounded-[5px] hover:bg-neutral-800">
            {menuOpen ? <X aria-hidden="true" className="size-6" /> : <Menu aria-hidden="true" className="size-6" />}
          </button>
          <p className="min-w-0 flex-1 truncate font-semibold">{title}</p>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F5F5F5] text-xs font-bold text-[#212529]">{initials(name)}</span>
        </header>
        <div id="back-office-menu" hidden={!menuOpen} className="sticky top-14 z-30 bg-[#111111] pt-2 print:hidden lg:hidden">
          {navigation}
          {account}
        </div>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
