import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json, parseId } from "@/server/http";
import { departureSupplyService } from "@/server/services/departure-supplies";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr", "Leader", "RouteMgr"]);
    const id = parseId((await context.params).id);
    return json(await departureSupplyService.readSupplies(actor, id));
  } catch (error) {
    return errorResponse(error);
  }
}
