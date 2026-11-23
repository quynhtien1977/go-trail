import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { checkInService } from "@/server/services/checkin";

// QR check-in and Absent marking (L01, PRD 5.4). The body names the departure the Leader is working.
export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Leader"]);
    assertSameOrigin(request);
    return json(await checkInService.checkIn(actor, await readJson(request, 1024)));
  } catch (error) { return errorResponse(error); }
}
