import type { Metadata } from "next";
import Link from "next/link";
import { accountDataService } from "@/server/services/account-data";
import { LeaderShell } from "@/components/leader/leader-shell";
import { TripList } from "@/components/leader/trip-list";
import { requireLeaderPage } from "./require-leader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chuyến được phân công — Go-Trail Leader" };

export default async function LeaderPage() {
  const actor = await requireLeaderPage("/leader");
  const departures = await accountDataService.listLeaderDepartures(actor);
  return (
    <LeaderShell topBar={{ kind: "brand" }}>
      <TripList departures={departures} />
      <Link href="/leader/supplies"
        className="mt-6 inline-flex min-h-11 items-center rounded-[5px] border border-[#186734] bg-white px-4 text-sm font-semibold text-[#186734]">
        Xem vật tư chuyến được phân công
      </Link>
    </LeaderShell>
  );
}
