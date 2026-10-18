import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { getDb } from "@/server/db";
import { errorResponse, json, parseId } from "@/server/http";
import { listAssignments } from "@/server/services/assignments";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    const { id } = await context.params;
    return json(await listAssignments(getDb(), actor, parseId(id)));
  } catch (error) { return errorResponse(error); }
}
