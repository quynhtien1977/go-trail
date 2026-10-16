"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Navbar } from "@/components/ui/navbar";
import { getLegacyMediaUrl } from "@/lib/legacy-media";

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!fullName.trim() || fullName.trim().length < 2) {
      errors.fullName = "Họ và tên cần có ít nhất 2 ký tự.";
    } else if (fullName.trim().length > 100) {
      errors.fullName = "Họ và tên tối đa 100 ký tự.";
    } else if (/[<>]/.test(fullName)) {
      errors.fullName = "Họ và tên không chứa ký tự đặc biệt < hoặc >.";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      errors.email = "Địa chỉ email không hợp lệ.";
    }

    const phoneClean = phone.trim();
    if (!phoneClean || !/^\+?[0-9]{9,15}$/.test(phoneClean)) {
      errors.phone = "Số điện thoại hợp lệ phải từ 9 đến 15 chữ số (ví dụ: 0901234567 hoặc +84901234567).";
    }

    if (!password) {
      errors.password = "Vui lòng nhập mật khẩu.";
    } else if (password.length < 12) {
      errors.password = "Mật khẩu bảo mật phải có tối thiểu 12 ký tự.";
    } else if (new TextEncoder().encode(password).length > 72) {
      errors.password = "Mật khẩu tối đa 72 byte UTF-8.";
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!validateForm()) {
      return;
    }

    startTransition(async () => {
      try {
        const payload = {
          email: email.trim().toLowerCase(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim(),
        };

        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => null);

        if (res.status === 201) {
          setSuccessMsg(
            "Đăng ký tài khoản thành công! Đang chuyển hướng bạn sang trang đăng nhập..."
          );
          setTimeout(() => {
            router.push("/login");
          }, 2000);
          return;
        }

        if (res.status === 409) {
          setErrorMsg(
            "Thông tin đăng ký không khả dụng hoặc địa chỉ email đã được sử dụng."
          );
        } else if (res.status === 429) {
          setErrorMsg(
            "Bạn đã thực hiện quá nhiều lượt đăng ký. Vui lòng thử lại sau 15 phút."
          );
        } else if (res.status === 503) {
          setErrorMsg(
            "Dịch vụ xác thực tạm thời không khả dụng. Vui lòng thử lại sau."
          );
        } else if (res.status === 422) {
          setErrorMsg(
            data?.error?.message ||
              "Dữ liệu gửi lên không đúng định dạng. Vui lòng kiểm tra lại các trường thông tin."
          );
        } else {
          setErrorMsg("Không thể hoàn tất đăng ký lúc này. Vui lòng thử lại sau.");
        }
      } catch {
        setErrorMsg("Có lỗi kết nối mạng. Vui lòng kiểm tra lại đường truyền của bạn.");
      }
    });
  };

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
          {/* Visual Brand Panel */}
          <div className="hidden lg:flex lg:col-span-5 flex-col justify-between p-10 rounded-2xl bg-neutral-900 text-white relative overflow-hidden min-h-[620px] shadow-xl border border-neutral-200/20 group">
            {/* Background image from Supabase */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style={{
                backgroundImage: `url('${getLegacyMediaUrl("legacy-35-e1742370003781")}')`,
              }}
            />
            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/35" />

            <div className="relative z-10 space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FEBB02] text-black text-xs font-extrabold uppercase tracking-wider">
                <span>✦</span> THÀNH VIÊN GO TRAIL
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight leading-snug">
                Bắt đầu những bước chân chinh phục thiên nhiên
              </h2>
              <p className="text-neutral-200 text-sm leading-relaxed max-w-md">
                Đăng ký tài khoản Khách hàng để chọn sơ đồ ghế xe bus yêu thích, nhận mã vé điện tử QR và thanh toán tự động tiện lợi.
              </p>
            </div>

            <div className="relative z-10 space-y-3 pt-6 border-t border-white/20">
              <div className="flex items-center gap-3 text-xs text-neutral-200 p-2.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/10">
                <div className="w-6 h-6 rounded-full bg-[#186734] text-white flex items-center justify-center font-bold shrink-0">
                  ✓
                </div>
                <span>Chọn trực tiếp số ghế khứ hồi trên xe bus</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-200 p-2.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/10">
                <div className="w-6 h-6 rounded-full bg-[#186734] text-white flex items-center justify-center font-bold shrink-0">
                  ✓
                </div>
                <span>Thanh toán tự động qua VietQR xác nhận tức thì</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-200 p-2.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/10">
                <div className="w-6 h-6 rounded-full bg-[#186734] text-white flex items-center justify-center font-bold shrink-0">
                  ✓
                </div>
                <span>Leader theo sát từng chặng đường an toàn 1:15</span>
              </div>
            </div>
          </div>

          {/* Form Panel */}
          <div className="w-full lg:col-span-7">
            <div className="w-full max-w-lg mx-auto bg-white rounded-2xl p-7 sm:p-9 shadow-[0px_10px_30px_rgba(0,0,0,0.06)] border border-neutral-200">
              <div className="mb-6 space-y-1.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#9ACE7D]/20 text-[#186734] text-xs font-bold mb-1">
                  <span className="w-2 h-2 rounded-full bg-[#186734]" />
                  Đăng ký tài khoản Khách hàng
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-[#121212] tracking-tight uppercase">
                  Tạo tài khoản mới
                </h1>
                <p className="text-sm text-neutral-600">
                  Điền thông tin để bắt đầu đặt vé xe và tham gia cùng đoàn
                </p>
              </div>

              {errorMsg && (
                <Alert type="error" className="mb-5">
                  {errorMsg}
                </Alert>
              )}

              {successMsg && (
                <Alert type="success" className="mb-5" title="Thành công!">
                  {successMsg}
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  label="Họ và tên"
                  placeholder="Nguyễn Văn A"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  error={fieldErrors.fullName}
                  required
                  autoComplete="name"
                  className="rounded-lg border-neutral-300 focus-visible:border-[#FEBB02] focus-visible:ring-[#FEBB02]/25"
                  leftIcon={
                    <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  }
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    label="Email"
                    placeholder="ban@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    error={fieldErrors.email}
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
                    id="phone"
                    name="phone"
                    type="tel"
                    label="Số điện thoại"
                    placeholder="0901234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    error={fieldErrors.phone}
                    required
                    autoComplete="tel"
                    className="rounded-lg border-neutral-300 focus-visible:border-[#FEBB02] focus-visible:ring-[#FEBB02]/25"
                    leftIcon={
                      <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    }
                  />
                </div>

                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  label="Mật khẩu"
                  placeholder="Tối thiểu 12 ký tự"
                  helperText="Tối thiểu 12 ký tự, không phân biệt khoảng trắng."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={fieldErrors.password}
                  required
                  autoComplete="new-password"
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

                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  label="Xác nhận mật khẩu"
                  placeholder="Nhập lại mật khẩu vừa nhập"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  error={fieldErrors.confirmPassword}
                  required
                  autoComplete="new-password"
                  className="rounded-lg border-neutral-300 focus-visible:border-[#FEBB02] focus-visible:ring-[#FEBB02]/25"
                  leftIcon={
                    <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
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
                  <span>Tạo tài khoản Khách hàng</span>
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-neutral-200 text-center space-y-2">
                <p className="text-sm text-neutral-600">
                  Đã có tài khoản Go Trail?{" "}
                  <Link
                    href="/login"
                    className="font-bold text-[#186734] hover:text-[#FEBB02] hover:underline transition-colors"
                  >
                    Đăng nhập tại đây
                  </Link>
                </p>
              </div>
            </div>
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
