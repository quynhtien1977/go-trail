import type { Metadata } from "next";
import { BackOfficeShell } from "@/components/accounts/back-office-shell";
import { AuditLog } from "@/components/admin/audit-log";

export const metadata: Metadata = { title: "Nhật ký hoạt động — Go-Trail" };

// Q04 audit log: Admin only (the proxy blocks other roles from /admin). Demo entries until an audit list API exists.
export default function AdminAuditPage() {
  return (
    <BackOfficeShell active="audit" title="Nhật ký hoạt động">
      <AuditLog />
    </BackOfficeShell>
  );
}
