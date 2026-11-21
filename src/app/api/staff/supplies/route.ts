import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { inventoryService } from "@/server/services/inventory";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr", "HRMgr"]);
    const url = new URL(request.url);
    const category = url.searchParams.get("category") || undefined;
    const is_active = url.searchParams.get("is_active") || undefined;
    const page = url.searchParams.get("page") || undefined;
    const pageSize = url.searchParams.get("pageSize") || undefined;
    return json(await inventoryService.listSupplyItems(actor, { category, is_active, page, pageSize }));
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
