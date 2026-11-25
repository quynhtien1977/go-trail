import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function StaffLoginPage() {
  return (
    <AuthShell portal="staff">
      <Suspense fallback={<p role="status" className="text-sm text-[#5C636A]">Đang tải biểu mẫu…</p>}>
        <LoginForm variant="staff" />
      </Suspense>
    </AuthShell>
  );
}
