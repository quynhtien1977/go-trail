import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { getDb } from "@/server/db";
import { assertSameOrigin, errorResponse, json, readJson, readQuery } from "@/server/http";
import { createTrip, listManagedTrips } from "@/server/services/catalog";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    return json(await listManagedTrips(getDb(), actor, readQuery(request)));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    assertSameOrigin(request);
    return json(await createTrip(getDb(), actor, await readJson(request, 65536)), 201);
  } catch (error) { return errorResponse(error); }
}
