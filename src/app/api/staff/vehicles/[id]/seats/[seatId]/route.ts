import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { fleetService } from "@/server/services/fleet";

type Context = { params: Promise<{ id: string; seatId: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const { id, seatId } = await context.params;
    return json(await fleetService.updateSeat(actor, parseId(id), parseId(seatId), await readJson(request)));
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const { id, seatId } = await context.params;
    return json(await fleetService.deactivateSeat(actor, parseId(id), parseId(seatId)));
  } catch (error) { return errorResponse(error); }
}
