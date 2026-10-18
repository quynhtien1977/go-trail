import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { getDb } from "@/server/db";
import { assertSameOrigin, errorResponse, json, parseId } from "@/server/http";
import { unassignVehicle } from "@/server/services/assignments";

type Context = { params: Promise<{ id: string; vehicleId: string }> };
export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const { id, vehicleId } = await context.params;
    return json(await unassignVehicle(getDb(), actor, parseId(id), parseId(vehicleId)));
  } catch (error) { return errorResponse(error); }
}
