import { getRouteActor } from "@/server/auth/session";
import { readAdminPortal } from "@/server/services/accounts";
import { getDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/ui/navbar";
import { RoleBadge } from "@/components/ui/role-badge";
import { StaffCatalogManager } from "@/components/catalog/staff-catalog-manager";
import type { Role } from "@/schemas/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let actor;
  try {
    actor = await getRouteActor("/admin");
  } catch (error) {
    if (error instanceof AppError && error.status === 401) {
      redirect("/staff/login?callbackUrl=/admin");
    }
    throw error;
  }

  const { usersCount, recentUsers, settings } = await readAdminPortal(getDb(), actor);

  const totalUsers = usersCount.reduce((acc, curr) => acc + curr._count.user_id, 0);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-[126px] sm:pt-[134px] pb-8 sm:pb-12 space-y-8">
        {/* Header Admin */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-black text-2xl shadow-md shrink-0">
              🛡️
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-white break-words">
                  Bảng Điều Khiển Quản Trị Hệ Thống
                </h1>
                <RoleBadge role={actor.role} />
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 break-words">
                Toàn quyền kiểm soát tài khoản, cấu hình tham số và nhật ký kiểm toán.
              </p>
            </div>
          </div>
        </div>

        {/* System Settings & User Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Tổng tài khoản</span>
            <div className="text-3xl font-black text-zinc-950 dark:text-white">{totalUsers}</div>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Toàn hệ thống</span>
          </div>

          {settings.map((st) => (
            <div
              key={st.setting_key}
              className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm space-y-1"
            >
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 font-mono">
                {st.setting_key}
              </span>
              <div className="text-3xl font-black text-[#febb02]">{st.setting_value}</div>
              <span className="text-xs text-zinc-400 line-clamp-1">{st.description || "Cấu hình"}</span>
            </div>
          ))}
        </div>

        {/* Role breakdown chips */}
        <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
            Phân bố người dùng theo vai trò
          </h2>
          <div className="flex flex-wrap gap-3">
            {usersCount.map((u) => (
              <div
                key={u.role}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm"
              >
                <RoleBadge role={u.role} />
                <span className="font-bold text-zinc-950 dark:text-white">{u._count.user_id}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Users Table */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-950 dark:text-white">
              Tài khoản mới nhất ({recentUsers.length})
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="pb-3 font-semibold">ID</th>
                  <th className="pb-3 font-semibold">Họ tên</th>
                  <th className="pb-3 font-semibold">Email</th>
                  <th className="pb-3 font-semibold">Vai trò</th>
                  <th className="pb-3 font-semibold">Trạng thái</th>
                  <th className="pb-3 font-semibold">Ngày tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                {recentUsers.map((u) => (
                  <tr key={u.user_id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3 font-mono text-xs text-zinc-500">#{u.user_id}</td>
                    <td className="py-3 font-medium text-zinc-900 dark:text-zinc-100">{u.full_name}</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">{u.email}</td>
                    <td className="py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="py-3">
                      <span
                        className={`text-xs font-bold ${
                          u.status === "Active"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-zinc-500">
                      {new Date(u.created_at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quản lý danh mục tuyến trekking & điểm đón xe */}
        <StaffCatalogManager actorRole={actor.role as Role} />
      </main>
    </div>
  );
}
