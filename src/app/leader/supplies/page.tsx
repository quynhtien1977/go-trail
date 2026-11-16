import { LeaderSupplyShell } from "@/components/supplies/supply-shell";
import { SupplyWorkspace } from "@/components/supplies/supply-workspace";

export default function LeaderSuppliesPage() {
  return (
    <LeaderSupplyShell>
      <SupplyWorkspace portal="leader" />
    </LeaderSupplyShell>
  );
}
