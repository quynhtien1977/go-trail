"use client";

import { useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Lock, Mail } from "lucide-react";
import {
  AuthAlert, AuthField, AuthSubmitButton, AuthTabs, CustomerGateNote, PasswordVisibilityToggle, StaffGateNote, authLinkClassName,
} from "@/components/auth/auth-controls";
import {
  EMAIL_MAX, loginFailureMessage, normalizeEmail, validateLogin, type FieldErrors, type LoginFields,
} from "@/lib/auth-form-validation";

export interface LoginFormProps {
  variant: "customer" | "staff";
}

export function LoginForm({ variant }: LoginFormProps) {
  const isStaff = variant === "staff";
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");

  const [fields, setFields] = useState<LoginFields>({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<keyof LoginFields>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof LoginFields, boolean>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [formError, setFormError] = useState<string | null>(() => loginFailureMessage(searchParams.get("error")));
  const [isPending, startTransition] = useTransition();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const ids = isStaff ? { email: "staff-email", password: "staff-password" } : { email: "email", password: "password" };

  const update = (field: keyof LoginFields, value: string) => {
    const next = { ...fields, [field]: value };
    setFields(next);
    // Once a field has been left (or the form submitted) keep its message in sync while the person corrects it.
    if (touched[field]) setErrors((current) => ({ ...current, [field]: validateLogin(next)[field] }));
  };

  const blur = (field: keyof LoginFields) => {
    if (!fields[field]) return; // Do not shout at an empty field the person just tabbed past.
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors((current) => ({ ...current, [field]: validateLogin(fields)[field] }));
  };

  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState("CapsLock"));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isPending) return;
    setFormError(null);

    const found = validateLogin(fields);
    setErrors(found);
    setTouched({ email: true, password: true });
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();

    startTransition(async () => {
      try {
        const result = await signIn(isStaff ? "staff-credentials" : "credentials", {
          email: normalizeEmail(fields.email),
          password: fields.password,
          redirect: false,
          callbackUrl: callbackUrl ?? "/",
        });
        if (!result) return setFormError("Không nhận được phản hồi từ máy chủ. Vui lòng thử lại.");
        if (result.error) {
          setFormError(loginFailureMessage(result.error));
          setFields((current) => ({ ...current, password: "" }));
          passwordRef.current?.focus();
          return;
        }
        if (result.ok && result.url) {
          router.push(result.url);
          router.refresh();
        }
      } catch {
        setFormError("Mất kết nối mạng. Vui lòng kiểm tra đường truyền rồi thử lại.");
      }
    });
  };

  const tabQuery = callbackUrl ? new URLSearchParams({ callbackUrl }).toString() : undefined;

  return (
    <>
      {!isStaff && <AuthTabs active="login" query={tabQuery} />}

      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold leading-tight text-[#212529]">{isStaff ? "Đăng nhập nhân sự" : "Đăng nhập"}</h1>
        <p className="text-sm text-[#5C636A]">
          {isStaff ? "Dùng email và mật khẩu do quản trị viên cấp." : "Chào bạn trở lại. Đăng nhập để tiếp tục chuyến đi."}
        </p>
      </div>

      {formError && <AuthAlert tone="error">{formError}</AuthAlert>}

      <form onSubmit={handleSubmit} noValidate aria-busy={isPending} className="flex flex-col gap-4">
        <AuthField
          ref={emailRef}
          id={ids.email}
          name="email"
          type="email"
          label="Email"
          placeholder={isStaff ? "ten@go-trail.example.test" : "email@vi-du.vn"}
          value={fields.email}
          onChange={(event) => update("email", event.target.value)}
          onBlur={() => blur("email")}
          error={errors.email}
          leftIcon={isStaff ? <Mail className="size-5" /> : undefined}
          required
          maxLength={EMAIL_MAX}
          autoComplete={isStaff ? "username" : "email"}
          autoCapitalize="none"
          spellCheck={false}
          inputMode="email"
        />
        <AuthField
          ref={passwordRef}
          id={ids.password}
          name="password"
          type={showPassword ? "text" : "password"}
          label="Mật khẩu"
          placeholder="Nhập mật khẩu"
          value={fields.password}
          onChange={(event) => update("password", event.target.value)}
          onBlur={() => { blur("password"); setCapsLock(false); }}
          onKeyUp={trackCapsLock}
          onKeyDown={trackCapsLock}
          error={errors.password}
          hint={capsLock ? "Caps Lock đang bật." : undefined}
          leftIcon={isStaff ? <Lock className="size-5" /> : undefined}
          rightSlot={<PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />}
          required
          autoComplete="current-password"
        />
        <AuthSubmitButton pending={isPending} tone={isStaff ? "green" : "yellow"}>Đăng nhập</AuthSubmitButton>
      </form>

      {isStaff ? (
        <CustomerGateNote />
      ) : (
        <>
          <p className="text-center text-sm text-[#5C636A]">
            Chưa có tài khoản?{" "}
            <Link href={tabQuery ? `/register?${tabQuery}` : "/register"} replace className={authLinkClassName}>Đăng ký</Link>
          </p>
          <StaffGateNote />
        </>
      )}
    </>
  );
}
