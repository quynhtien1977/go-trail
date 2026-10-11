"use client";

import { useState, useTransition, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Navbar } from "@/components/ui/navbar";
import type { Role } from "@/schemas/auth";

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
          // If a safe internal callbackUrl was provided and starts with "/", use it
          if (callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
            router.push(callbackUrl);
            router.refresh();
            return;
          }

          // Otherwise, inspect actor role to redirect to the proper landing page
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
      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-zinc-200/80 dark:border-zinc-800/80">
        <div className="mb-6 space-y-1 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-xs font-bold mb-2">
            <span className="w-2 h-2 rounded-full bg-[#febb02]" />
            Hệ thống đặt vé Go-Trail
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-950 dark:text-white tracking-tight">
            Đăng nhập
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
            leftIcon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            leftIcon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            }
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
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

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full mt-2"
            isLoading={isPending}
          >
            Đăng nhập ngay
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800 text-center space-y-2">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Chưa có tài khoản Go-Trail?{" "}
            <Link
              href="/register"
              className="font-bold text-[#d97706] dark:text-[#febb02] hover:underline"
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
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="flex-1 flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Visual Brand Panel (Desktop/Tablet) */}
          <div className="hidden lg:flex lg:col-span-6 flex-col justify-between p-8 rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-black text-white relative overflow-hidden min-h-[540px] border border-zinc-800">
            <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#febb02_1px,transparent_1px)] [background-size:16px_16px]" />
            <div
              className="absolute inset-0 opacity-20 bg-cover bg-center mix-blend-overlay"
              style={{
                backgroundImage: "url('https://anqtlegcsrqzqenytrjo.supabase.co/storage/v1/object/public/gotrail-media/PHOR7222.JPG_compressed.jpeg')",
              }}
            />

            <div className="relative z-10 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-[#febb02]">
                ✦ Khám phá cung đường mới
              </div>
              <h2 className="text-3xl font-black tracking-tight leading-snug">
                Hành trình trekking an tâm cùng Leader bản địa
              </h2>
              <p className="text-zinc-300 text-sm leading-relaxed">
                Đặt xe bus đưa đón tận nơi từ TP.HCM, an toàn tuyệt đối với Leader kiểm soát tốc độ và sơ cứu y tế đồng hành suốt tuyến đường.
              </p>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-3 pt-6 border-t border-white/10">
              <div className="p-3 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
                <div className="text-[#febb02] font-black text-xl">100%</div>
                <div className="text-xs text-zinc-400">Xe bus đời mới & ghế chọn sẵn</div>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
                <div className="text-emerald-400 font-black text-xl">1:15</div>
                <div className="text-xs text-zinc-400">Tỷ lệ Leader đồng hành đoàn</div>
              </div>
            </div>
          </div>

          {/* Form Panel */}
          <div className="w-full lg:col-span-6">
            <Suspense
              fallback={
                <div className="w-full max-w-md mx-auto p-8 bg-white dark:bg-zinc-900 rounded-3xl animate-pulse h-96" />
              }
            >
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
