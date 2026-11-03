import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, readJson, readQuery } from "@/server/http";
import { staffService } from "@/server/services/staff";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    return json(await staffService.listStaff(actor, readQuery(request)));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    return json(await staffService.createStaff(actor, await readJson(request)), 201);
  } catch (error) { return errorResponse(error); }
}
