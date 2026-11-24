"use client";

import { StaffInvoiceShell } from "@/components/invoices/staff-invoice-shell";
import { InvoiceManagementWorkspace } from "@/components/invoices/invoice-management-workspace";
import { staffInvoiceSource } from "@/lib/invoice-management-ui";

export default function StaffInvoicesPage() {
  return (
    <StaffInvoiceShell>
      <InvoiceManagementWorkspace source={staffInvoiceSource} />
    </StaffInvoiceShell>
  );
}
