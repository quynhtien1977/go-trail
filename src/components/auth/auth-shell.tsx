import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { MountainSnow } from "lucide-react";
import mountain from "@/assets/auth-mountain.jpg";

export type AuthPortal = "customer" | "staff";

// Two-panel auth frame shared by /login, /register (customer) and /staff/login (internal staff).
// Desktop: brand panel left, form right. Mobile: the brand panel shrinks to a short banner above the form.
export function AuthShell({ portal = "customer", children }: { portal?: AuthPortal; children: ReactNode }) {
  const staff = portal === "staff";

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-[#F8F9FA] text-[#212529] lg:grid-cols-12">
      <aside
        className={
          "relative isolate flex min-h-[200px] flex-col justify-between gap-6 overflow-hidden p-6 sm:min-h-[260px] sm:p-10 lg:sticky lg:top-0 lg:col-span-5 lg:h-dvh lg:p-16 xl:col-span-6 " +
          (staff ? "bg-[#186734]" : "bg-[#1b2a1f]")
        }
      >
        {/* Absolute layer gives next/image a positioned parent even when the panel is sticky on desktop. */}
        <div aria-hidden="true" className={"absolute inset-0 -z-10 " + (staff ? "bg-[#186734]" : "bg-[#1b2a1f]")}>
          <Image
            src={mountain}
            alt=""
            fill
            priority
            sizes="(min-width: 1280px) 50vw, (min-width: 1024px) 42vw, 100vw"
            placeholder="blur"
            className={staff ? "object-cover opacity-45 mix-blend-multiply" : "object-cover"}
          />
          {!staff && (
            // Scrim keeps white text readable over the photo.
            <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.75)_0%,rgba(0,0,0,0.3)_50%,rgba(0,0,0,0.6)_100%)]" />
          )}
        </div>

        {staff ? (
          <Link href="/" className="flex w-fit items-center gap-3 rounded-[5px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FEBB02]">
            <span className="flex size-11 items-center justify-center rounded-[8px] bg-[#FEBB02] text-[#212529] lg:size-12">
              <MountainSnow aria-hidden="true" className="size-6" />
            </span>
            <span className="flex flex-col">
              <span className="text-xl font-bold leading-tight text-white">Go-Trail</span>
              <span className="text-xs font-medium text-[#A6F4B3]">Cổng vận hành nội bộ</span>
            </span>
          </Link>
        ) : (
          <Link href="/" className="w-fit rounded-[5px] text-2xl font-extrabold tracking-tight text-[#FEBB02] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FEBB02] lg:text-3xl">
            Go-Trail
          </Link>
        )}

        <div className="flex max-w-xl flex-col gap-3 lg:gap-4">
          {staff && <p className="text-xs font-bold uppercase tracking-widest text-[#FFDEA4]">Dành cho nhân sự Go-Trail</p>}
          <p className="text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">
            {staff ? "Đăng nhập để vận hành chuyến đi" : "Đặt vé xe trekking có Leader dẫn đoàn"}
          </p>
          <p className="hidden max-w-md text-base leading-relaxed text-neutral-200 sm:block">
            {staff
              ? "Leader, quản lý tuyến, quản lý nhân sự và quản trị viên dùng chung cổng này. Hệ thống tự chuyển bạn đến đúng trang sau khi đăng nhập."
              : "Chọn chuyến, giữ ghế và thanh toán bằng VietQR trong vài phút."}
          </p>
        </div>

        <div aria-hidden="true" className="hidden lg:block" />
      </aside>

      <main className="flex flex-col items-center justify-center px-4 py-8 sm:px-12 sm:py-12 lg:col-span-7 lg:px-16 xl:col-span-6">
        <div className="flex w-full max-w-[440px] flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
