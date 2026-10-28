import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json, parseId } from "@/server/http";
import { assignmentService } from "@/server/services/assignments";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr", "RouteMgr", "Leader"]);
    const { id } = await context.params;
    return json(await assignmentService.listAssignments(actor, parseId(id)));
  } catch (error) { return errorResponse(error); }
}
