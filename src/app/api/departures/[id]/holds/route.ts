import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { getDb } from "@/server/db";
import { assertSameOrigin, errorResponse, json, parseId, readJson } from "@/server/http";
import { holdSeats } from "@/server/services/bookings";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Customer"]);
    assertSameOrigin(request);
    const { id } = await context.params;
    return json(await holdSeats(getDb(), actor, parseId(id), await readJson(request, 32768)), 201);
  } catch (error) { return errorResponse(error); }
}
