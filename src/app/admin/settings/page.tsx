import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRouteActor } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { adminService } from "@/server/services/admin";
import { BackOfficeShell } from "@/components/accounts/back-office-shell";
import { SystemSettings } from "@/components/admin/system-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cấu hình hệ thống — Go-Trail" };

// Q04 settings: editable SYSTEM_SETTINGS via the admin service (same data as GET /api/admin/settings).
export default async function AdminSettingsPage() {
  let actor;
  try {
    actor = await getRouteActor("/admin");
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/staff/login?callbackUrl=/admin/settings");
    throw error;
  }
  const settings = await adminService.listSettings(actor);
  return (
    <BackOfficeShell active="settings" title="Cấu hình hệ thống">
      <SystemSettings rows={settings} />
    </BackOfficeShell>
  );
}
