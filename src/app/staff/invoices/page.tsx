"use client";

import { BackOfficeShell } from "@/components/accounts/back-office-shell";
import { InvoiceManagementWorkspace } from "@/components/invoices/invoice-management-workspace";
import { staffInvoiceSource } from "@/lib/invoice-management-ui";

export default function StaffInvoicesPage() {
  return (
    <BackOfficeShell active="invoices" title="Hóa đơn & vé">
      <InvoiceManagementWorkspace source={staffInvoiceSource} />
    </BackOfficeShell>
  );
}
