import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRouteActor } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { BackOfficeShell } from "@/components/accounts/back-office-shell";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tổng quan — Go-Trail" };

// Q04 dashboard for Admin. Route/pickup catalog management lives under "Vận hành chuyến" (/staff).
export default async function AdminPage() {
  try {
    await getRouteActor("/admin");
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/staff/login?callbackUrl=/admin");
    throw error;
  }
  return (
    <BackOfficeShell active="overview" title="Tổng quan">
      <AdminDashboard />
    </BackOfficeShell>
  );
}
