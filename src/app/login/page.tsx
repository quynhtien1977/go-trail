"use client";

import { useState, useTransition, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Navbar } from "@/components/ui/navbar";
import type { Role } from "@/schemas/auth";
import { getSafeAuthCallback } from "@/lib/auth-redirect";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg("Vui lòng điền đầy đủ email và mật khẩu.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await signIn("credentials", {
          email: email.trim().toLowerCase(),
          password,
          redirect: false,
        });

        if (!res) {
          setErrorMsg("Không nhận được phản hồi từ máy chủ xác thực.");
          return;
        }

        if (res.error) {
          if (res.error === "CredentialsSignin") {
            setErrorMsg(
              "Email hoặc mật khẩu không chính xác, hoặc tài khoản đang bị tạm khóa."
            );
          } else if (res.error === "AUTH_UNAVAILABLE") {
            setErrorMsg(
              "Dịch vụ xác thực tạm thời không khả dụng. Vui lòng thử lại sau giây lát."
            );
          } else {
            setErrorMsg("Đăng nhập không thành công. Vui lòng thử lại.");
          }
          return;
        }

        if (res.ok) {
          const destination = getSafeAuthCallback(callbackUrl, window.location.origin);
          if (destination) {
            router.push(destination);
            router.refresh();
            return;
          }

          try {
            const meRes = await fetch("/api/account/me");
            if (meRes.ok) {
              const body = await meRes.json();
              const role: Role = body?.data?.role;
              switch (role) {
                case "Leader":
                  router.push("/leader");
                  break;
                case "RouteMgr":
                case "HRMgr":
                case "Accountant":
                  router.push("/staff");
                  break;
                case "Admin":
                  router.push("/admin");
                  break;
                case "Customer":
                default:
                  router.push("/account");
                  break;
              }
              router.refresh();
              return;
            }
          } catch {
            // fallback
          }

          router.push("/account");
          router.refresh();
        }
      } catch {
        setErrorMsg("Có lỗi xảy ra trong quá trình đăng nhập. Vui lòng thử lại.");
      }
    });
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl p-7 sm:p-9 shadow-[0px_10px_30px_rgba(0,0,0,0.06)] border border-neutral-200">
        <div className="mb-6 space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#9ACE7D]/20 text-[#186734] text-xs font-bold mb-1">
            <span className="w-2 h-2 rounded-full bg-[#186734]" />
            Hệ thống đặt vé Go Trail
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#121212] tracking-tight uppercase">
            Đăng nhập
          </h1>
          <p className="text-sm text-neutral-600">
            Truy cập chuyến đi của bạn cùng Leader dẫn đoàn
          </p>
        </div>

        {errorMsg && (
          <Alert type="error" className="mb-5">
            {errorMsg}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="email"
            name="email"
            type="email"
            label="Địa chỉ Email"
            placeholder="ban@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="rounded-lg border-neutral-300 focus-visible:border-[#FEBB02] focus-visible:ring-[#FEBB02]/25"
            leftIcon={
              <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.206" />
              </svg>
            }
          />

          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            label="Mật khẩu"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="rounded-lg border-neutral-300 focus-visible:border-[#FEBB02] focus-visible:ring-[#FEBB02]/25"
            leftIcon={
              <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            }
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-neutral-400 hover:text-neutral-700 transition-colors"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            }
          />

          <button
            type="submit"
            disabled={isPending}
            className="w-full mt-2 py-3.5 px-6 rounded-lg bg-[#FEBB02] hover:bg-[#e5a802] active:scale-[0.99] text-black font-extrabold text-[15px] uppercase tracking-wide transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer"
          >
            {isPending && (
              <svg className="animate-spin -ml-1 mr-2 w-4 h-4 text-black" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            <span>Đăng nhập ngay</span>
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-neutral-200 text-center space-y-2">
          <p className="text-sm text-neutral-600">
            Chưa có tài khoản Go Trail?{" "}
            <Link
              href="/register"
              className="font-bold text-[#186734] hover:text-[#FEBB02] hover:underline transition-colors"
            >
              Đăng ký tài khoản
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex flex-col bg-[#F8F9FA] text-[#212529] font-sans antialiased selection:bg-[#FEBB02] selection:text-black bg-cover bg-top"
      style={{
        backgroundImage: "url('/ref/topo-gotrail-2.svg'), url('/ref/topo2.svg')",
        backgroundColor: "#F8F9FA",
      }}
    >
      <Navbar />

      <main className="flex-1 flex items-center justify-center pt-[120px] pb-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Visual Brand Panel (Desktop/Tablet) */}
          <div className="hidden lg:flex lg:col-span-6 flex-col justify-between p-10 rounded-2xl bg-neutral-900 text-white relative overflow-hidden min-h-[560px] shadow-xl border border-neutral-200/20 group">
            {/* Background image from Supabase */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style={{
                backgroundImage:
                  "url('https://anqtlegcsrqzqenytrjo.supabase.co/storage/v1/object/public/gotrail-media/KVBUS-3.jpg')",
              }}
            />
            {/* Elegant dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/30" />

            {/* Top brand header */}
            <div className="relative z-10 space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FEBB02] text-black text-xs font-extrabold uppercase tracking-wider">
                <span>✦</span> YOUR WEEKEND TRAIL
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight leading-snug">
                Hành trình trekking an tâm cùng Leader bản địa
              </h2>
              <p className="text-neutral-200 text-sm leading-relaxed max-w-md">
                Những chuyến xe bus đưa đón tận nơi từ TP.HCM, kết nối bạn với những cung đường xanh – nơi bạn có thể hít thở không khí trong lành và tìm lại sự tự do.
              </p>
            </div>

            {/* Bottom value props */}
            <div className="relative z-10 grid grid-cols-2 gap-3 pt-6 border-t border-white/20">
              <div className="p-3.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/10">
                <div className="text-[#FEBB02] font-black text-2xl">100%</div>
                <div className="text-xs text-neutral-300 mt-0.5">Xe bus đời mới & ghế chọn sẵn</div>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/10">
                <div className="text-[#9ACE7D] font-black text-2xl">1:15</div>
                <div className="text-xs text-neutral-300 mt-0.5">Tỷ lệ Leader đồng hành đoàn</div>
              </div>
            </div>
          </div>

          {/* Form Panel */}
          <div className="w-full lg:col-span-6">
            <Suspense
              fallback={
                <div className="w-full max-w-md mx-auto p-8 bg-white rounded-2xl animate-pulse h-96 shadow-lg border border-neutral-200" />
              }
            >
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </main>

      {/* Mini Footer */}
      <footer className="py-6 border-t border-neutral-200/80 bg-white/80 backdrop-blur-sm text-center text-xs text-neutral-500">
        <p>
          Copyright © 2026 Go Trail. Công ty TNHH Khám Phá Trải Nghiệm Tổ Ong · Hotline:{" "}
          <a href="tel:0972699242" className="font-semibold text-neutral-700 hover:text-[#186734]">
            0972699242
          </a>
        </p>
      </footer>
    </div>
  );
}
