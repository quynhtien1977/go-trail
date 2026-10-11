import { getCurrentActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { updateAccountAccess } from "@/server/services/accounts";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await updateAccountAccess(getDb(), actor, parseId(id), await readJson(request)));
  } catch (error) { return errorResponse(error); }
}
