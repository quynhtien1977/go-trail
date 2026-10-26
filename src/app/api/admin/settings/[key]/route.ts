import { getCurrentActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { updateSetting } from "@/server/services/admin";

export async function PATCH(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const actor = await getCurrentActor();
    assertSameOrigin(request);
    const { key } = await context.params;
    return json(await updateSetting(getDb(), actor, key, await readJson(request, 1024)));
  } catch (error) { return errorResponse(error); }
}
