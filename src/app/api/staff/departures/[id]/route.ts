import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { departureService } from "@/server/services/departures";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    const { id } = await context.params;
    return json(await departureService.readManagedDeparture(actor, parseId(id)));
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await departureService.updateDeparture(actor, parseId(id), await readJson(request, 16384)));
  } catch (error) { return errorResponse(error); }
}
