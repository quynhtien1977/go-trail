import { StaffSupplyShell } from "@/components/supplies/supply-shell";
import { SupplyWorkspace } from "@/components/supplies/supply-workspace";

export default function StaffSuppliesPage() {
  return (
    <StaffSupplyShell>
      <SupplyWorkspace portal="staff" />
    </StaffSupplyShell>
  );
}
