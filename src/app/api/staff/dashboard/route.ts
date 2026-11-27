import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json, readQuery } from "@/server/http";
import { dashboardService } from "@/server/services/dashboard";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr","RouteMgr"]);
    return json(await dashboardService.readDashboard(actor, readQuery(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
