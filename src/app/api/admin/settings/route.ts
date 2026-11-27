import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json } from "@/server/http";
import { adminService } from "@/server/services/admin";

export async function GET() {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Admin"]);
    return json(await adminService.listSettings(actor)); }
  catch (error) { return errorResponse(error); }
}
