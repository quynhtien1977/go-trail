import type { Metadata } from "next";
import { BackOfficeShell } from "@/components/accounts/back-office-shell";
import { AccountDirectory } from "@/components/accounts/account-directory";

export const metadata: Metadata = { title: "Quản lý tài khoản — Go-Trail" };

// C04 + A01: the proxy gates /admin; the API re-checks Admin access on every request.
export default function AdminAccountsPage() {
  return (
    <BackOfficeShell active="accounts" title="Quản lý tài khoản">
      <AccountDirectory />
    </BackOfficeShell>
  );
}
