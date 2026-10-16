import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { getDb } from "@/server/db";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { readManagedTrip, updateTrip } from "@/server/services/catalog";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    const { id } = await context.params;
    return json(await readManagedTrip(getDb(), actor, parseId(id)));
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await updateTrip(getDb(), actor, parseId(id), await readJson(request, 65536)));
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await updateTrip(getDb(), actor, parseId(id), { is_active: false }));
  } catch (error) { return errorResponse(error); }
}
