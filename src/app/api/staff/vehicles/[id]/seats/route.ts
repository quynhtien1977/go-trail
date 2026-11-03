import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { fleetService } from "@/server/services/fleet";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await fleetService.addSeat(actor, parseId(id), await readJson(request)), 201);
  } catch (error) { return errorResponse(error); }
}
