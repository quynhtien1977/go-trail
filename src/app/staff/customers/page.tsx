import type { Metadata } from "next";
import { BackOfficeShell } from "@/components/accounts/back-office-shell";
import { CustomerDirectory } from "@/components/accounts/customer-directory";

export const metadata: Metadata = { title: "Quản lý khách hàng — Go-Trail" };

// C04 + C03: Admin sees every customer; RouteMgr only customers of invoices they are responsible for.
// The proxy gates /staff; the C03 API re-checks role and scope on every request.
export default function StaffCustomersPage() {
  return (
    <BackOfficeShell active="customers" title="Quản lý khách hàng">
      <CustomerDirectory />
    </BackOfficeShell>
  );
}
