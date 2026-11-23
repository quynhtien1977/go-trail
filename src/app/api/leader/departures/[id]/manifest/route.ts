import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json, parseId } from "@/server/http";
import { checkInService } from "@/server/services/checkin";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Leader"]);
    const { id } = await context.params;
    return json(await checkInService.readManifest(actor, parseId(id)));
  } catch (error) { return errorResponse(error); }
}
