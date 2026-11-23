import { StaffInvoiceShell } from "@/components/invoices/staff-invoice-shell";
import { InvoiceManagementWorkspace } from "@/components/invoices/invoice-management-workspace";

export default function StaffInvoicesPage() {
  return (
    <StaffInvoiceShell>
      <InvoiceManagementWorkspace />
    </StaffInvoiceShell>
  );
}
