"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthSubmitButton, PasswordVisibilityToggle, authLinkClassName } from "@/components/auth/auth-controls";

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
    <AuthShell>
      <div className="mb-8">
        <h1 className="text-[30px] font-semibold leading-tight tracking-tight sm:text-[32px]">Tạo tài khoản</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">Đăng ký để đặt vé và theo dõi chuyến đi của bạn.</p>
      </div>
      {errorMsg && <Alert type="error" className="mb-6">{errorMsg}</Alert>}
      {successMsg && <Alert type="success" className="mb-6">{successMsg}</Alert>}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate aria-busy={isPending}>
        <Input appearance="auth" id="fullName" name="fullName" label="Họ và tên"
          value={fullName} onChange={(e) => setFullName(e.target.value)}
          required autoComplete="name" error={fieldErrors.fullName} />
        <Input appearance="auth" id="email" name="email" type="email" label="Email"
          placeholder="ban@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
          required autoComplete="email" autoCapitalize="none" spellCheck={false} error={fieldErrors.email} />
        <Input appearance="auth" id="phone" name="phone" type="tel" label="Số điện thoại"
          value={phone} onChange={(e) => setPhone(e.target.value)}
          required autoComplete="tel" error={fieldErrors.phone} />
        <Input appearance="auth" id="password" name="password" type={showPassword ? "text" : "password"} label="Mật khẩu"
          value={password} onChange={(e) => setPassword(e.target.value)}
          required autoComplete="new-password" error={fieldErrors.password}
          helperText="Ít nhất 12 ký tự. Khoảng trắng được giữ nguyên."
          rightIcon={<PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword(!showPassword)} />} />
        <Input appearance="auth" id="confirmPassword" name="confirmPassword" type={showPassword ? "text" : "password"} label="Nhập lại mật khẩu"
          value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
          required autoComplete="new-password" error={fieldErrors.confirmPassword} />
        <div className="pt-2">
          <AuthSubmitButton pending={isPending} disabled={!!successMsg}>Tạo tài khoản</AuthSubmitButton>
        </div>
      </form>
      <p className="mt-7 text-center text-sm leading-6 text-zinc-600">
        Đã có tài khoản? <Link href="/login" className={authLinkClassName}>Đăng nhập</Link>
      </p>
    </AuthShell>
  );
}
