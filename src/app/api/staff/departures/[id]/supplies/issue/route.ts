import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, readJson, errorResponse, json, parseId } from "@/server/http";
import { departureSupplyService } from "@/server/services/departure-supplies";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const id = parseId((await context.params).id);
    return json(await departureSupplyService.moveSupply(actor, id, "Issue", await readJson(request)), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
