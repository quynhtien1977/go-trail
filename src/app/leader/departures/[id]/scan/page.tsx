import type { Metadata } from "next";
import { ScanWorkspace } from "@/components/leader/scan-workspace";
import { parseDepartureId, requireLeaderPage } from "../../../require-leader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quét QR check-in — Go-Trail Leader" };

export default async function LeaderScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const departureId = parseDepartureId(id);
  await requireLeaderPage(`/leader/departures/${departureId}/scan`);
  return <ScanWorkspace departureId={departureId} />;
}
