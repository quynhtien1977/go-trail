import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { getDb } from "@/server/db";
import { assertSameOrigin, errorResponse, json, parseId, readJson, readQuery } from "@/server/http";
import { createMaintenance, listMaintenance } from "@/server/services/fleet";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    const { id } = await context.params;
    return json(await listMaintenance(getDb(), actor, parseId(id), readQuery(request)));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["HRMgr"]);
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await createMaintenance(getDb(), actor, parseId(id), await readJson(request)), 201);
  } catch (error) { return errorResponse(error); }
}
