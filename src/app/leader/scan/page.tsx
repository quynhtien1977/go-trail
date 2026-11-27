import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, QrCode } from "lucide-react";
import { accountDataService } from "@/server/services/account-data";
import { LeaderShell } from "@/components/leader/leader-shell";
import { DepartureStatusBadge, EmptyState, buttonOutline } from "@/components/leader/leader-ui-parts";
import { formatDepartureDate } from "@/lib/leader-ui";
import { requireLeaderPage } from "../require-leader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chọn chuyến để quét — Go-Trail Leader" };

// "Quét QR" tab outside a departure: check-in always belongs to one departure, so pick it first.
export default async function LeaderScanPickerPage() {
  const actor = await requireLeaderPage("/leader/scan");
  const departures = (await accountDataService.listLeaderDepartures(actor))
    .filter((item) => item.status === "Running" || item.status === "Confirmed")
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "Running" ? -1 : 1));
  if (departures.length === 1) redirect(`/leader/departures/${departures[0].departure_id}/scan`);

  return (
    <LeaderShell topBar={{ kind: "detail", title: "Quét QR check-in", subtitle: "Chọn chuyến đang dẫn", backHref: "/leader" }}>
      {departures.length === 0 ? (
        <EmptyState icon={<QrCode aria-hidden="true" className="size-10" />} title="Chưa có chuyến để check-in"
          action={<Link href="/leader" className={buttonOutline}>Xem chuyến được phân công</Link>}>
          Chỉ chuyến đã chốt chạy hoặc đang chạy mới mở check-in.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {departures.map((departure) => (
            <li key={departure.departure_id}>
              <Link href={`/leader/departures/${departure.departure_id}/scan`}
                className="flex min-h-16 items-center justify-between gap-3 rounded-[5px] border border-[#E0E0E0] bg-white p-4 hover:border-[#186734]">
                <div className="min-w-0">
                  <p className="break-words font-bold">{departure.trip.name}</p>
                  <p className="text-sm text-[#5C636A]">{formatDepartureDate(departure.departure_date)} · #{departure.departure_id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <DepartureStatusBadge status={departure.status} />
                  <ChevronRight aria-hidden="true" className="size-5 text-[#5C636A]" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </LeaderShell>
  );
}
