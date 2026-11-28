import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json, readQuery } from "@/server/http";
import { adminService } from "@/server/services/admin";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Admin"]);
    return json(await adminService.listAuditLogs(actor, readQuery(request))); }
  catch (error) { return errorResponse(error); }
}
