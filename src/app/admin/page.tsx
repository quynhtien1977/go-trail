import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRouteActor } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { BackOfficeShell } from "@/components/accounts/back-office-shell";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { StaffCatalogManager } from "@/components/catalog/staff-catalog-manager";
import type { Role } from "@/schemas/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tổng quan — Go-Trail" };

// Q04 dashboard. Route/pickup catalog management stays below it so Admin keeps that tool on /admin.
export default async function AdminPage() {
  let actor;
  try {
    actor = await getRouteActor("/admin");
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/staff/login?callbackUrl=/admin");
    throw error;
  }

  return (
    <BackOfficeShell active="overview" title="Tổng quan">
      <div className="space-y-10">
        <AdminDashboard />
        <section aria-label="Tuyến trekking và điểm đón" className="border-t border-[#E0E0E0] pt-8">
          <StaffCatalogManager actorRole={actor.role as Role} />
        </section>
      </div>
    </BackOfficeShell>
  );
}
