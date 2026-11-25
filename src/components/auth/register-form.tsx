"use client";

import { useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthAlert, AuthField, AuthSubmitButton, AuthTabs, PasswordVisibilityToggle, StaffGateNote, authLinkClassName,
} from "@/components/auth/auth-controls";
import {
  EMAIL_MAX, NAME_MAX, PASSWORD_MIN, PHONE_INPUT_MAX, registerFailureMessage, toRegistrationPayload, validateRegistration,
  type FieldErrors, type RegisterFields,
} from "@/lib/auth-form-validation";

type Field = keyof RegisterFields;
const ORDER: Field[] = ["fullName", "email", "phone", "password", "confirmPassword"];
const EMPTY: RegisterFields = { fullName: "", email: "", phone: "", password: "", confirmPassword: "" };

export function RegisterForm() {
  const router = useRouter();
  const callbackUrl = useSearchParams().get("callbackUrl");
  const tabQuery = callbackUrl ? new URLSearchParams({ callbackUrl }).toString() : undefined;
  const loginHref = tabQuery ? `/login?${tabQuery}` : "/login";

  const [fields, setFields] = useState<RegisterFields>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const update = (field: Field, value: string) => {
    const next = { ...fields, [field]: value };
    setFields(next);
    const all = validateRegistration(next);
    setErrors((current) => {
      const updated = { ...current };
      if (touched[field]) updated[field] = all[field];
      // Changing the password re-checks the confirmation the person already typed.
      if (field === "password" && touched.confirmPassword) updated.confirmPassword = all.confirmPassword;
      return updated;
    });
  };

  const blur = (field: Field) => {
    if (!fields[field]) return;
    setTouched((current) => ({ ...current, [field]: true }));
    setErrors((current) => ({ ...current, [field]: validateRegistration(fields)[field] }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending || done) return;
    setFormError(null);

    const found = validateRegistration(fields);
    setErrors(found);
    setTouched({ fullName: true, email: true, phone: true, password: true, confirmPassword: true });
    const first = ORDER.find((field) => found[field]);
    if (first) return (event.currentTarget.elements.namedItem(first) as HTMLInputElement | null)?.focus();

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toRegistrationPayload(fields)),
        });
        if (response.status === 201) {
          setDone(true);
          setTimeout(() => router.replace(loginHref), 1500);
          return;
        }
        setFormError(registerFailureMessage(response.status));
      } catch {
        setFormError("Mất kết nối mạng. Vui lòng kiểm tra đường truyền rồi thử lại.");
      }
    });
  };

  const field = (name: Field) => ({
    id: `register-${name}`,
    name,
    value: fields[name],
    onChange: (event: ChangeEvent<HTMLInputElement>) => update(name, event.target.value),
    onBlur: () => blur(name),
    error: errors[name],
    required: true,
    disabled: done,
  });

  const toggle = <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />;

  return (
    <>
      <AuthTabs active="register" query={tabQuery} />

      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold leading-tight text-[#212529]">Đăng ký tài khoản</h1>
        <p className="text-sm text-[#5C636A]">Tạo tài khoản để đặt vé và theo dõi chuyến đi.</p>
      </div>

      {formError && <AuthAlert tone="error">{formError}</AuthAlert>}
      {done && <AuthAlert tone="success">Tạo tài khoản thành công. Đang chuyển sang trang đăng nhập…</AuthAlert>}

      <form onSubmit={handleSubmit} noValidate aria-busy={isPending} className="flex flex-col gap-4">
        <AuthField {...field("fullName")} label="Họ và tên" placeholder="Nguyễn Văn A" maxLength={NAME_MAX} autoComplete="name" />
        <AuthField {...field("email")} type="email" label="Email" placeholder="email@vi-du.vn" maxLength={EMAIL_MAX}
          autoComplete="email" autoCapitalize="none" spellCheck={false} inputMode="email" />
        <AuthField {...field("phone")} type="tel" label="Số điện thoại" placeholder="0912345678" maxLength={PHONE_INPUT_MAX}
          autoComplete="tel" inputMode="tel" />
        <AuthField {...field("password")} type={showPassword ? "text" : "password"} label="Mật khẩu" placeholder="Nhập mật khẩu"
          autoComplete="new-password" hint={`Tối thiểu ${PASSWORD_MIN} ký tự.`} rightSlot={toggle} />
        <AuthField {...field("confirmPassword")} type={showPassword ? "text" : "password"} label="Nhập lại mật khẩu"
          placeholder="Nhập lại mật khẩu" autoComplete="new-password" />
        <AuthSubmitButton pending={isPending} disabled={done}>Tạo tài khoản</AuthSubmitButton>
      </form>

      <p className="text-center text-sm text-[#5C636A]">
        Đã có tài khoản? <Link href={loginHref} replace className={authLinkClassName}>Đăng nhập</Link>
      </p>
      <StaffGateNote />
    </>
  );
}
