import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { getDb } from "@/server/db";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { updateSeat } from "@/server/services/fleet";

type Context = { params: Promise<{ id: string; seatId: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const { id, seatId } = await context.params;
    return json(await updateSeat(getDb(), actor, parseId(id), parseId(seatId), await readJson(request)));
  } catch (error) { return errorResponse(error); }
}

// Departure seats keep referencing old seats, so delete deactivates.
export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const { id, seatId } = await context.params;
    return json(await updateSeat(getDb(), actor, parseId(id), parseId(seatId), { is_active: false }));
  } catch (error) { return errorResponse(error); }
}
