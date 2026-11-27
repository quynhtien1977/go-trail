import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { adminService } from "@/server/services/admin";

export async function PATCH(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Admin"]);
    assertSameOrigin(request);
    const { key } = await context.params;
    return json(await adminService.updateSetting(actor, key, await readJson(request, 1024)));
  } catch (error) { return errorResponse(error); }
}
