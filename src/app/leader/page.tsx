import { getRouteActor } from "@/server/auth/session";
import { accountDataService } from "@/server/services/account-data";
import { AppError } from "@/server/errors";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/ui/navbar";
import { RoleBadge } from "@/components/ui/role-badge";

export const dynamic = "force-dynamic";

export default async function LeaderPage() {
  let actor;
  try {
    actor = await getRouteActor("/leader");
  } catch (error) {
    if (error instanceof AppError && error.status === 401) {
      redirect("/staff/login?callbackUrl=/leader");
    }
    throw error;
  }

  const departures = await accountDataService.listLeaderDepartures(actor);

  const formatVietnamTime = (isoString: string) => {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoString));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Confirmed":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Đã chốt chạy
          </span>
        );
      case "Running":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            Đang chạy tour
          </span>
        );
      case "Ended":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
            Đã kết thúc
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-[126px] sm:pt-[134px] pb-8 sm:pb-12 space-y-8">
        {/* Header Leader */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-2xl shadow-md shrink-0">
              🧭
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-white break-words">
                  Leader Portal — Điều hành dẫn đoàn
                </h1>
                <RoleBadge role={actor.role} />
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Quản lý các chuyến trekking được phân công phụ trách và check-in khách tại điểm đón.
              </p>
            </div>
          </div>
        </div>

        {/* Departures List */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>Chuyến trekking được phân công</span>
              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
                {departures.length} chuyến
              </span>
            </h2>
          </div>

          {departures.length === 0 ? (
            <div className="p-12 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 text-center space-y-3">
              <div className="text-3xl">🎒</div>
              <p className="font-bold text-zinc-800 dark:text-zinc-200">
                Chưa có chuyến trekking nào được phân công cho bạn
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                Khi phòng Nhân sự (HRMgr) điều động bạn phụ trách chuyến, danh sách và danh sách hành khách sẽ hiển thị tại đây.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {departures.map((dep) => (
                <div
                  key={dep.departure_id}
                  className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:border-emerald-500/40 transition-all space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-base text-zinc-950 dark:text-white">
                        {dep.trip.name}
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        📍 {dep.trip.city} • {dep.trip.location_name}
                      </p>
                    </div>
                    {getStatusBadge(dep.status)}
                  </div>

                  <div className="text-xs space-y-1 text-zinc-600 dark:text-zinc-400 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
                    <div className="flex items-center justify-between">
                      <span>Mã chuyến:</span>
                      <span className="font-mono font-bold text-zinc-900 dark:text-zinc-200">
                        #{dep.departure_id}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Khởi hành (giờ VN):</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                        {formatVietnamTime(dep.departure_date)}
                      </span>
                    </div>
                    {dep.is_demo && (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                        (Dữ liệu mẫu tham khảo)
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <button
                      className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                      title="Tính năng quét QR check-in ngày đi"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                      Quét QR Check-in hành khách
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
