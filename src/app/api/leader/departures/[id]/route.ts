import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { departureService } from "@/server/services/departures";
import { AppError } from "@/server/errors";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Leader"]);
    assertSameOrigin(request);
    const raw = await readJson(request, 16384);
    if (!raw || typeof raw !== "object" || (raw as { status?: unknown }).status !== "Ended") {
      throw new AppError("INVALID_INPUT", 422);
    }
    const { id } = await context.params;
    return json(await departureService.endLeaderDeparture(actor, parseId(id)));
  } catch (error) {
    return errorResponse(error);
  }
}
