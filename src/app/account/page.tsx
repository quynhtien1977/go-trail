import { getRouteActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import { RoleBadge } from "@/components/ui/role-badge";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  let actor;
  try {
    actor = await getRouteActor("/account");
  } catch (error) {
    if (error instanceof AppError && error.status === 401) {
      redirect("/login?callbackUrl=/account");
    }
    throw error;
  }

  const user = await getDb().user.findUniqueOrThrow({
    where: { user_id: actor.user_id },
    select: {
      user_id: true,
      email: true,
      full_name: true,
      phone: true,
      role: true,
      status: true,
      created_at: true,
    },
  });

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-[126px] sm:pt-[134px] pb-8 sm:pb-12 space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-2xl bg-[#febb02] text-zinc-950 flex items-center justify-center font-black text-2xl shadow-md shrink-0">
              {user.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-white break-words">
                  Xin chào, {user.full_name}
                </h1>
                <RoleBadge role={user.role} />
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Thành viên Go-Trail #{user.user_id} • Trạng thái:{" "}
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {user.status === "Active" ? "Đang hoạt động" : "Tạm khóa"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/#system-trailbus"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-bold bg-[#febb02] hover:bg-[#e5a800] text-zinc-950 text-sm shadow-sm transition-all"
            >
              Đặt chuyến mới
            </Link>
          </div>
        </div>

        {/* Account Details & Ticket Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* User Profile Card */}
          <div className="md:col-span-1 p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#febb02]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Thông tin cá nhân
            </h2>

            <div className="space-y-3 text-sm">
              <div>
                <span className="block text-xs text-zinc-400">Họ và tên</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{user.full_name}</span>
              </div>
              <div>
                <span className="block text-xs text-zinc-400">Email</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{user.email}</span>
              </div>
              <div>
                <span className="block text-xs text-zinc-400">Số điện thoại</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{user.phone}</span>
              </div>
              <div>
                <span className="block text-xs text-zinc-400">Ngày tham gia</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {new Date(user.created_at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                </span>
              </div>
            </div>
          </div>

          {/* Bookings / Trips Section */}
          <div className="md:col-span-2 p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
                Vé xe & Chuyến trekking đã đặt
              </h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold">
                0 chuyến
              </span>
            </div>

            {/* Empty State */}
            <div className="p-8 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 text-[#febb02] flex items-center justify-center mx-auto text-xl">
                🚌
              </div>
              <div className="space-y-1">
                <p className="font-bold text-zinc-800 dark:text-zinc-200">
                  Bạn chưa có chuyến trekking nào sắp tới
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                  Các chuyến xe bus khứ hồi đi Bà Đen, Chứa Chan, Núi Dinh kèm Leader đang mở bán.
                </p>
              </div>
              <Link
                href="/#system-trailbus"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#d97706] dark:text-[#febb02] hover:underline pt-2"
              >
                Khám phá danh sách chuyến xe →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
