import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { inventoryService } from "@/server/services/inventory";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr", "HRMgr"]);
    const { id } = await context.params;
    return json(await inventoryService.readSupplyItem(actor, parseId(id)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = await readJson(request, 16384);
    return json(await inventoryService.updateSupplyItem(actor, parseId(id), body));
  } catch (error) {
    return errorResponse(error);
  }
}
