import type { Metadata } from "next";
import { BackOfficeShell } from "@/components/accounts/back-office-shell";
import { AccountDirectory } from "@/components/accounts/account-directory";

export const metadata: Metadata = { title: "Quản lý tài khoản — Go-Trail" };

// C04 + A01: Admin only (the proxy blocks other roles from /admin). The account list uses demo data until
// an admin account-list API exists; role/status changes for real accounts go through PATCH /api/admin/users/:id/access.
export default function AdminAccountsPage() {
  return (
    <BackOfficeShell active="accounts" title="Quản lý tài khoản">
      <AccountDirectory />
    </BackOfficeShell>
  );
}
