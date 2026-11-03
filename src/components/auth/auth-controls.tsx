"use client";

import type { ReactNode } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

export const authLinkClassName =
  "rounded-sm font-medium text-forest-dark underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest-dark";

export function PasswordVisibilityToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  const Icon = visible ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
      aria-pressed={visible}
      className="flex size-11 cursor-pointer items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-forest-dark"
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  );
}

export function AuthSubmitButton({
  pending,
  disabled,
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-brand-yellow px-4 py-3 text-base font-semibold text-black transition-colors hover:bg-brand-yellow-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest-dark disabled:cursor-wait disabled:opacity-60"
    >
      {pending && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {pending ? "Đang xử lý…" : children}
    </button>
  );
}
