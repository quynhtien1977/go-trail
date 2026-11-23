import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, parseId } from "@/server/http";
import { departureService } from "@/server/services/departures";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Leader"]);
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await departureService.endLeaderDeparture(actor, parseId(id)));
  } catch (error) {
    return errorResponse(error);
  }
}
