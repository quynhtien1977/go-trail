import { getCurrentActor } from "@/server/auth/session";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { accountsService } from "@/server/services/accounts";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await accountsService.updateAccountAccess(actor, parseId(id), await readJson(request)));
  } catch (error) { return errorResponse(error); }
}
