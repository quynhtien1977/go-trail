import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, readJson, readQuery } from "@/server/http";
import { inventoryService } from "@/server/services/inventory";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    // Strict query: unknown or repeated parameters are rejected instead of silently ignored.
    return json(await inventoryService.listSupplyItems(actor, readQuery(request)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const body = await readJson(request, 16384);
    return json(await inventoryService.createSupplyItem(actor, body), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
