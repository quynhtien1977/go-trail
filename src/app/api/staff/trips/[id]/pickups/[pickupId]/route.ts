import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { catalogService } from "@/server/services/catalog";

type Context = { params: Promise<{ id: string; pickupId: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    assertSameOrigin(request);
    const { id, pickupId } = await context.params;
    return json(await catalogService.updatePickup(actor, parseId(id), parseId(pickupId), await readJson(request)));
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    assertSameOrigin(request);
    const { id, pickupId } = await context.params;
    return json(await catalogService.retirePickup(actor, parseId(id), parseId(pickupId)));
  } catch (error) { return errorResponse(error); }
}
