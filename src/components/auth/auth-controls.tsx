"use client";

import Link from "next/link";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { ArrowRight, CircleAlert, CircleCheck, Eye, EyeOff, Info, LoaderCircle, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

export const authLinkClassName =
  "rounded-[5px] font-semibold text-[#186734] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#186734]";

type AuthFieldProps = Omit<ComponentProps<"input">, "id"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
};

// Label + input + hint/error, wired with aria-invalid / aria-describedby (DESIGN.md: 1px #E0E0E0, radius 5px).
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { id, label, error, hint, leftIcon, rightSlot, className, ...props },
  ref,
) {
  const messageId = error || hint ? `${id}-message` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[#212529]">{label}</label>
      <div className="relative flex items-center">
        {leftIcon && <span aria-hidden="true" className="pointer-events-none absolute left-3.5 text-[#707A6F]">{leftIcon}</span>}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          className={cn(
            "h-12 w-full rounded-[5px] border bg-white text-base text-[#212529] outline-none transition-colors placeholder:text-[#9AA0A6] focus:ring-2 sm:text-sm",
            leftIcon ? "pl-11" : "pl-3.5",
            rightSlot ? "pr-12" : "pr-3.5",
            error ? "border-[#C62828] focus:border-[#C62828] focus:ring-[#C62828]/15" : "border-[#E0E0E0] focus:border-[#186734] focus:ring-[#186734]/15",
            className,
          )}
          {...props}
        />
        {rightSlot && <span className="absolute right-0.5 flex items-center">{rightSlot}</span>}
      </div>
      {error ? (
        <p id={messageId} className="flex items-start gap-1 text-xs font-medium text-[#C62828]">
          <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />{error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-[#5C636A]">{hint}</p>
      ) : null}
    </div>
  );
});

export function PasswordVisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const Icon = visible ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
      aria-pressed={visible}
      className="flex size-11 cursor-pointer items-center justify-center rounded-[5px] text-[#5C636A] hover:text-[#212529] focus-visible:outline-2 focus-visible:outline-[#186734]"
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}

export function AuthAlert({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-[5px] border p-3 text-sm",
        tone === "error" ? "border-[#C62828]/20 bg-[#FFEBEE] text-[#C62828]" : "border-[#186734]/20 bg-[#E8F5E9] text-[#186734]",
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function AuthSubmitButton({
  pending,
  disabled,
  tone = "yellow",
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  tone?: "yellow" | "green";
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={cn(
        "mt-1 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[5px] px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        tone === "yellow"
          ? "bg-[#FEBB02] text-[#212529] hover:bg-[#EBB002] focus-visible:outline-[#186734]"
          : "bg-[#186734] text-white hover:bg-[#004E22] focus-visible:outline-[#186734]",
      )}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : tone === "green" ? (
        <LogIn className="size-4" aria-hidden="true" />
      ) : null}
      {pending ? "Đang xử lý…" : children}
    </button>
  );
}

// Segmented switch between /login and /register. Real links, so the browser back button and deep links work.
export function AuthTabs({ active, query }: { active: "login" | "register"; query?: string }) {
  const suffix = query ? `?${query}` : "";
  const tab = (key: "login" | "register", label: string) => (
    <Link
      href={`/${key}${suffix}`}
      aria-current={active === key ? "page" : undefined}
      replace
      className={cn(
        "flex h-10 items-center justify-center rounded-[5px] text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#186734]",
        active === key ? "bg-white text-[#212529]" : "text-[#5C636A] hover:text-[#212529]",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Chọn đăng nhập hoặc đăng ký" className="grid grid-cols-2 gap-1 rounded-[5px] bg-[#EAEAEA] p-1">
      {tab("login", "Đăng nhập")}
      {tab("register", "Đăng ký")}
    </nav>
  );
}

export function StaffGateNote() {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[5px] border border-[#E0E0E0] bg-[#F5F5F5] px-4 py-3 text-sm text-[#5C636A]">
      <span>Nhân viên Go-Trail đăng nhập tại cổng nội bộ</span>
      <Link href="/staff/login" className={authLinkClassName}>Đến cổng nội bộ</Link>
    </div>
  );
}

export function CustomerGateNote() {
  return (
    <div className="mt-2 flex items-start gap-3 rounded-[5px] border border-[#E0E0E0] bg-[#F1F4F9] p-4 text-sm text-[#404940]">
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <p>
        Bạn là khách hàng?{" "}
        <Link href="/login" className={cn(authLinkClassName, "inline-flex items-center gap-1")}>
          Đăng nhập tại trang khách hàng <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </p>
    </div>
  );
}
