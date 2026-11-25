import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <AuthShell portal="customer">
      <Suspense fallback={<p role="status" className="text-sm text-[#5C636A]">Đang tải biểu mẫu…</p>}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
