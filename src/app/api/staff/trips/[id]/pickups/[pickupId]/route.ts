import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { getDb } from "@/server/db";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { updatePickup } from "@/server/services/catalog";

type Context = { params: Promise<{ id: string; pickupId: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    assertSameOrigin(request);
    const { id, pickupId } = await context.params;
    return json(await updatePickup(getDb(), actor, parseId(id), parseId(pickupId), await readJson(request)));
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    assertSameOrigin(request);
    const { id, pickupId } = await context.params;
    return json(await updatePickup(getDb(), actor, parseId(id), parseId(pickupId), { is_active: false }));
  } catch (error) { return errorResponse(error); }
}
