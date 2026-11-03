import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, readJson, readQuery } from "@/server/http";
import { fleetService } from "@/server/services/fleet";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    return json(await fleetService.listVehicles(actor, readQuery(request)));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    return json(await fleetService.createVehicle(actor, await readJson(request, 65536)), 201);
  } catch (error) { return errorResponse(error); }
}
