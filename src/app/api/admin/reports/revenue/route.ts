import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json, readQuery } from "@/server/http";
import { revenueService } from "@/server/services/revenue";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Admin"]);
    return json(await revenueService.readRevenue(actor, readQuery(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
