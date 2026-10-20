"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { AuthSubmitButton, PasswordVisibilityToggle, authLinkClassName } from "@/components/auth/auth-controls";

export interface LoginFormProps {
  variant: "customer" | "staff";
  className?: string;
}

export function LoginForm({ variant, className }: LoginFormProps) {
  const isStaff = variant === "staff";
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(() => {
    if (urlError === "CredentialsSignin") {
      return "Email hoặc mật khẩu không chính xác, hoặc tài khoản đang bị tạm khóa.";
    }
    if (urlError === "AUTH_UNAVAILABLE") {
      return "Dịch vụ xác thực tạm thời không khả dụng. Vui lòng thử lại sau giây lát.";
    }
    if (urlError) {
      return "Đăng nhập không thành công. Vui lòng thử lại.";
    }
    return null;
  });
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setErrorMsg("Vui lòng điền đầy đủ email và mật khẩu.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await signIn(isStaff ? "staff-credentials" : "credentials", {
          email: cleanEmail,
          password,
          redirect: false,
          callbackUrl: callbackUrl ?? "/",
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

        if (res.ok && res.url) {
          router.push(res.url);
          router.refresh();
        }
      } catch {
        setErrorMsg("Có lỗi xảy ra trong quá trình đăng nhập. Vui lòng thử lại.");
      }
    });
  };

  return (
    <div className={className}>
      <div className="mb-8">
        <h1 className="text-[30px] font-semibold leading-tight tracking-tight sm:text-[32px]">
          {isStaff ? "Đăng nhập nội bộ" : "Đăng nhập"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          {isStaff
            ? "Sử dụng tài khoản do Go Trail cấp cho nhân sự."
            : "Chào bạn trở lại. Đăng nhập để tiếp tục chuyến đi."}
        </p>
      </div>
      {errorMsg && <Alert type="error" className="mb-6">{errorMsg}</Alert>}
      <form onSubmit={handleSubmit} className="space-y-5" aria-busy={isPending}>
        <Input
          appearance="auth"
          id={isStaff ? "staff-email" : "email"}
          name="email"
          type="email"
          label="Email"
          placeholder="ban@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        <Input
          appearance="auth"
          id={isStaff ? "staff-password" : "password"}
          name="password"
          type={showPassword ? "text" : "password"}
          label="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          rightIcon={<PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
        />
        <div className="pt-2">
          <AuthSubmitButton pending={isPending}>Đăng nhập</AuthSubmitButton>
        </div>
      </form>
      <div className="mt-7 text-center text-sm leading-6 text-zinc-600">
        {isStaff ? (
          <Link href="/login" className={authLinkClassName}>
            Đăng nhập dành cho khách hàng
          </Link>
        ) : (
          <p>
            Chưa có tài khoản?{" "}
            <Link href="/register" className={authLinkClassName}>
              Đăng ký
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
