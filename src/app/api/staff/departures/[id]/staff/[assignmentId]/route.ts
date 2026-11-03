import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, parseId } from "@/server/http";
import { assignmentService } from "@/server/services/assignments";

type Context = { params: Promise<{ id: string; assignmentId: string }> };
export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const { id, assignmentId } = await context.params;
    return json(await assignmentService.unassignStaff(actor, parseId(id), parseId(assignmentId)));
  } catch (error) { return errorResponse(error); }
}
