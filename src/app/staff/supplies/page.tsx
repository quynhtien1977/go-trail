import { BackOfficeShell } from "@/components/accounts/back-office-shell";
import { SupplyWorkspace } from "@/components/supplies/supply-workspace";

export default function StaffSuppliesPage() {
  return (
    <BackOfficeShell active="supplies" title="Kho vật tư">
      <SupplyWorkspace portal="staff" />
    </BackOfficeShell>
  );
}
