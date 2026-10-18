import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { getDb } from "@/server/db";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { readVehicle, updateVehicle } from "@/server/services/fleet";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    const { id } = await context.params;
    return json(await readVehicle(getDb(), actor, parseId(id)));
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await updateVehicle(getDb(), actor, parseId(id), await readJson(request)));
  } catch (error) { return errorResponse(error); }
}

// Vehicles are referenced by departures and maintenance history, so delete deactivates.
export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await updateVehicle(getDb(), actor, parseId(id), { status: "Inactive" }));
  } catch (error) { return errorResponse(error); }
}
