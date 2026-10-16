import { getRouteActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/ui/navbar";
import { RoleBadge } from "@/components/ui/role-badge";
import { StaffCatalogManager } from "@/components/catalog/staff-catalog-manager";
import type { Role } from "@/schemas/auth";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  let actor;
  try {
    actor = await getRouteActor("/staff");
  } catch (error) {
    if (error instanceof AppError && error.status === 401) {
      redirect("/login?callbackUrl=/staff");
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
    },
  });

  const getRoleResponsibilities = (role: string) => {
    switch (role) {
      case "RouteMgr":
        return {
          title: "Quản lý Tuyến đường & Vận hành Web",
          items: [
            "Quản lý danh mục tuyến trekking, độ dài, mô tả cung đường và điểm đón xe",
            "Mở chuyến, chốt chạy hoặc hủy chuyến trekking (kích hoạt hoàn tiền tự động)",
            "Xem manifest danh sách hành khách và hỗ trợ sửa check-in thủ công khi cần",
          ],
        };
      case "HRMgr":
        return {
          title: "Quản lý Nhân sự & Đội xe",
          items: [
            "Quản lý hồ sơ nhân sự (STAFF): tài xế, phụ xe và Leader dẫn tour",
            "Quản lý đội xe bus của công ty, đăng kiểm, bảo dưỡng kỹ thuật",
            "Phân công xe và Leader cho từng chuyến khởi hành; kiểm tra tỷ lệ 1 Leader / N khách",
          ],
        };
      case "Accountant":
        return {
          title: "Kế toán & Quản lý Tài chính",
          items: [
            "Đối soát các giao dịch thanh toán chuyển khoản qua cổng VietQR / SePay",
            "Xử lý các khoản thanh toán cần rà soát (NeedsReview)",
            "Duyệt và xác nhận các lệnh hoàn tiền (REFUNDS) cho khách hủy vé",
          ],
        };
      case "Admin":
      default:
        return {
          title: "Quản trị viên toàn hệ thống",
          items: [
            "Toàn quyền truy cập và điều hành mọi phân hệ nhân sự, vận hành và kế toán",
            "Giám sát nhật ký kiểm toán AUDIT_LOGS và cấu hình hệ thống SYSTEM_SETTINGS",
          ],
        };
    }
  };

  const resp = getRoleResponsibilities(user.role);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-[126px] sm:pt-[134px] pb-8 sm:pb-12 space-y-8">
        {/* Header Staff */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-2xl shadow-md shrink-0">
              ⚙️
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-white break-words">
                  Cổng Vận hành Nội bộ (Staff Operations)
                </h1>
                <RoleBadge role={user.role} />
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 break-words">
                Nhân sự: <span className="font-bold text-zinc-900 dark:text-zinc-100">{user.full_name}</span>{" "}
                <span className="break-all">({user.email})</span>
              </p>
            </div>
          </div>
        </div>

        {/* Operational Modules Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-zinc-950 dark:text-white">
              {resp.title}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Các phạm vi nghiệp vụ được phân quyền cho vai trò của bạn theo PRD Go-Trail
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {resp.items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/80 text-sm text-zinc-800 dark:text-zinc-200"
              >
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center shrink-0">
                  {idx + 1}
                </div>
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
            * Phân hệ CRUD danh mục tuyến và điểm đón đã sẵn sàng bên dưới dành cho RouteMgr và Admin.
          </div>
        </div>

        {/* Phân hệ Quản lý Tuyến & Điểm đón xe */}
        <StaffCatalogManager actorRole={user.role as Role} />
      </main>
    </div>
  );
}
