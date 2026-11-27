import type { Metadata } from "next";
import { ManifestView } from "@/components/leader/manifest-view";
import { parseDepartureId, requireLeaderPage } from "../../require-leader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Danh sách khách — Go-Trail Leader" };

// Data (and the assignment check) comes from GET /api/leader/departures/:id/manifest, which returns 404
// for a departure outside the Leader's scope.
export default async function LeaderManifestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const departureId = parseDepartureId(id);
  await requireLeaderPage(`/leader/departures/${departureId}`);
  return <ManifestView departureId={departureId} />;
}
