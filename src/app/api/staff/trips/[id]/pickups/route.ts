import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { getDb } from "@/server/db";
import { assertSameOrigin, errorResponse, json, parseId, readJson, readQuery } from "@/server/http";
import { createPickup, listManagedPickups } from "@/server/services/catalog";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    const { id } = await context.params;
    return json(await listManagedPickups(getDb(), actor, parseId(id), readQuery(request)));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await createPickup(getDb(), actor, parseId(id), await readJson(request)), 201);
  } catch (error) { return errorResponse(error); }
}
