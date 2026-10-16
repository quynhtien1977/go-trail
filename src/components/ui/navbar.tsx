"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState, useRef } from "react";
import { RoleBadge } from "./role-badge";
import type { Role } from "@/schemas/auth";
import { Menu, X, ChevronDown, User, LogOut, LayoutDashboard } from "lucide-react";
import megaMenuData from "@/lib/fixtures/gotrail-megamenu.json";

interface TrailItem {
  targetId: string;
  name: string;
  link: string;
  desc: string;
  img: string;
}

const southTrails: TrailItem[] = (megaMenuData[0]?.trails as TrailItem[]) || [];
const northTrails: TrailItem[] = (megaMenuData[1]?.trails as TrailItem[]) || [];

export function Navbar() {
  const { data: session, status } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<"south" | "north" | null>(null);
  const [selectedTrail, setSelectedTrail] = useState<TrailItem | null>(southTrails[0] || null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (menu: "south" | "north") => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActiveMenu(menu);
    if (menu === "south") {
      setSelectedTrail(southTrails[0] || null);
    } else {
      setSelectedTrail(northTrails[0] || null);
    }
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
    }, 200);
  };

  const role = session?.user?.role as Role | undefined;

  const getDashboardPath = (userRole?: Role) => {
    switch (userRole) {
      case "Leader":
        return "/leader";
      case "RouteMgr":
      case "HRMgr":
      case "Accountant":
        return "/staff";
      case "Admin":
        return "/admin";
      case "Customer":
      default:
        return "/account";
    }
  };

  const dashboardPath = getDashboardPath(role);

  return (
    <header className="fixed top-0 left-0 right-0 z-[99999] h-[102px] bg-black text-white border-b border-white/10 flex items-center transition-all">
      <div className="w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center shrink-0">
          {/* Authentic Logo */}
          <img
            src="/ref/logo.png"
            alt="Go Trail Logo"
            width={136}
            height={64}
            className="h-12 sm:h-14 w-auto object-contain"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-7 text-[16px] font-semibold">
          {/* Miền Nam with Mega Menu */}
          <div
            className="relative py-8"
            onMouseEnter={() => handleMouseEnter("south")}
            onMouseLeave={handleMouseLeave}
          >
            <button
              type="button"
              className={`flex items-center gap-1 transition-colors hover:text-[#FEBB02] ${
                activeMenu === "south" ? "text-[#FEBB02]" : "text-white"
              }`}
            >
              <span>Miền Nam</span>
              <ChevronDown className="w-4 h-4 opacity-70" />
            </button>
          </div>

          {/* Miền Bắc with Mega Menu */}
          <div
            className="relative py-8"
            onMouseEnter={() => handleMouseEnter("north")}
            onMouseLeave={handleMouseLeave}
          >
            <button
              type="button"
              className={`flex items-center gap-1 transition-colors hover:text-[#FEBB02] ${
                activeMenu === "north" ? "text-[#FEBB02]" : "text-white"
              }`}
            >
              <span>Miền Bắc</span>
              <ChevronDown className="w-4 h-4 opacity-70" />
            </button>
          </div>

          {/* Miền Trung */}
          <Link
            href="/#system-trailbus"
            className="text-white hover:text-[#FEBB02] transition-colors"
          >
            Miền Trung
          </Link>

          {/* About Us */}
          <Link
            href="/about-us"
            className="text-white hover:text-[#FEBB02] transition-colors"
          >
            About Us
          </Link>
        </nav>

        {/* Auth / Account Buttons */}
        <div className="hidden lg:flex items-center gap-3">
          {status === "loading" ? (
            <div className="w-24 h-9 bg-neutral-800 animate-pulse rounded-full" />
          ) : session?.user ? (
            <div className="flex items-center gap-3">
              <Link
                href={dashboardPath}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900 border border-neutral-700 hover:border-[#FEBB02] transition-colors text-sm"
              >
                <div className="w-7 h-7 rounded-full bg-[#FEBB02] text-black font-bold flex items-center justify-center text-xs">
                  {session.user.name?.[0] || session.user.email?.[0] || "U"}
                </div>
                <span className="font-semibold text-white max-w-[120px] truncate">
                  {session.user.name || session.user.email?.split("@")[0]}
                </span>
                {role && <RoleBadge role={role} className="text-[11px] py-0 px-2" />}
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                title="Đăng xuất"
                className="p-2 text-neutral-400 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-4 py-2 rounded-full text-sm font-bold text-white hover:text-[#FEBB02] transition-colors"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="px-5 py-2 rounded-full text-sm font-bold bg-[#FEBB02] text-black hover:bg-[#E5A800] transition-transform hover:scale-105 shadow-md"
              >
                Đăng ký
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu trigger */}
        <div className="flex items-center gap-2 lg:hidden">
          {session?.user && (
            <Link
              href={dashboardPath}
              className="p-2 rounded-full bg-neutral-900 text-[#FEBB02]"
              title="Tài khoản"
            >
              <User className="w-5 h-5" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-white hover:text-[#FEBB02] focus:outline-none"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
          </button>
        </div>
      </div>

      {/* Mega Menu Overlay (Desktop) */}
      {activeMenu && (
        <div
          className="hidden lg:block absolute top-[102px] left-0 right-0 bg-[#000000] border-t border-b border-neutral-800 shadow-2xl z-50 text-white animate-in fade-in duration-150"
          onMouseEnter={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
          }}
          onMouseLeave={handleMouseLeave}
        >
          <div className="max-w-[1280px] mx-auto px-8 py-8">
            <div className="grid grid-cols-12 gap-8 items-start">
              {/* Left Column: Trail List */}
              <div className="col-span-5 border-r border-neutral-800 pr-6 max-h-[460px] overflow-y-auto">
                <h4 className="text-xs uppercase tracking-widest text-[#FEBB02] font-extrabold mb-4">
                  Danh sách Trail Bus {activeMenu === "south" ? "Miền Nam" : "Miền Bắc"}
                </h4>
                <ul className="space-y-1">
                  {(activeMenu === "south" ? southTrails : northTrails).map((trail) => {
                    const isSelected = selectedTrail?.targetId === trail.targetId;
                    return (
                      <li key={trail.targetId}>
                        <button
                          type="button"
                          onMouseEnter={() => setSelectedTrail(trail)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-between ${
                            isSelected
                              ? "bg-[#FEBB02] text-black font-bold"
                              : "text-neutral-300 hover:text-white hover:bg-neutral-900"
                          }`}
                        >
                          <span>{trail.name}</span>
                          {isSelected && <span className="text-xs font-bold">→</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Right Column: Preview Detail & Image */}
              <div className="col-span-7 pl-4">
                {selectedTrail ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl font-black text-white">
                        {selectedTrail.name}
                      </h3>
                      <Link
                        href={`/#system-trailbus`}
                        onClick={() => setActiveMenu(null)}
                        className="text-xs font-bold uppercase tracking-wider text-[#FEBB02] hover:underline"
                      >
                        Xem trong danh sách →
                      </Link>
                    </div>

                    <p className="text-sm text-neutral-300 leading-relaxed min-h-[70px]">
                      {selectedTrail.desc ||
                        "Cung đường trekking hòa mình cùng thiên nhiên kỳ vĩ, đưa đón khứ hồi và có Leader dẫn đoàn an toàn."}
                    </p>

                    <div className="relative h-56 rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800">
                      {selectedTrail.img ? (
                        <img
                          src={selectedTrail.img}
                          alt={selectedTrail.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-500 text-sm">
                          Go Trail Bus Experience
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-neutral-500 text-sm py-12 text-center">
                    Rê chuột qua tuyến đường để xem chi tiết
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-[102px] bg-black/95 z-50 p-6 overflow-y-auto border-t border-neutral-800 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-6">
            <div>
              <h4 className="text-xs uppercase tracking-widest text-[#FEBB02] font-black mb-3">
                Miền Nam
              </h4>
              <div className="grid grid-cols-1 gap-2 pl-2">
                {southTrails.slice(0, 6).map((trail) => (
                  <Link
                    key={trail.targetId}
                    href="/#system-trailbus"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-sm text-neutral-300 hover:text-[#FEBB02]"
                  >
                    {trail.name}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-widest text-[#FEBB02] font-black mb-3">
                Miền Bắc
              </h4>
              <div className="grid grid-cols-1 gap-2 pl-2">
                {northTrails.slice(0, 4).map((trail) => (
                  <Link
                    key={trail.targetId}
                    href="/#system-trailbus"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-sm text-neutral-300 hover:text-[#FEBB02]"
                  >
                    {trail.name}
                  </Link>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-800 space-y-3">
              <Link
                href="/#system-trailbus"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-base font-bold text-white hover:text-[#FEBB02]"
              >
                Miền Trung
              </Link>
              <Link
                href="/about-us"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-base font-bold text-white hover:text-[#FEBB02]"
              >
                About Us
              </Link>
            </div>

            {/* Mobile Auth */}
            <div className="pt-4 border-t border-neutral-800">
              {session?.user ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#FEBB02] text-black font-black flex items-center justify-center">
                      {session.user.name?.[0] || session.user.email?.[0] || "U"}
                    </div>
                    <div>
                      <div className="font-bold text-white">{session.user.name}</div>
                      <div className="text-xs text-neutral-400">{session.user.email}</div>
                    </div>
                  </div>
                  <Link
                    href={dashboardPath}
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-sm font-bold text-white"
                  >
                    <LayoutDashboard className="w-4 h-4 text-[#FEBB02]" />
                    <span>Bảng điều khiển</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="w-full py-2.5 rounded-xl bg-red-950/40 border border-red-900 text-sm font-bold text-red-300 flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="py-3 text-center rounded-xl font-bold bg-neutral-900 text-white border border-neutral-700"
                  >
                    Đăng nhập
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="py-3 text-center rounded-xl font-bold bg-[#FEBB02] text-black"
                  >
                    Đăng ký
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
