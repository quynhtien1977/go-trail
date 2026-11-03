import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { assignmentService } from "@/server/services/assignments";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await assignmentService.assignVehicle(actor, parseId(id), await readJson(request)));
  } catch (error) { return errorResponse(error); }
}
