import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { inventoryService } from "@/server/services/inventory";

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const body = await readJson(request, 16384);
    return json(await inventoryService.receiveSupply(actor, body), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
