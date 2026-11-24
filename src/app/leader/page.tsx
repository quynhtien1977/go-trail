import type { Metadata } from "next";
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
    </LeaderShell>
  );
}
