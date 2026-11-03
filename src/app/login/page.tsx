import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={<p role="status" className="text-sm text-zinc-600">Đang tải biểu mẫu…</p>}>
        <LoginForm variant="customer" />
      </Suspense>
    </AuthShell>
  );
}
