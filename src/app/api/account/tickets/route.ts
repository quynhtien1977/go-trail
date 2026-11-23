import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json, readQuery } from "@/server/http";
import { ticketsService } from "@/server/services/tickets";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Customer"]);
    return json(await ticketsService.listOwnTickets(actor, readQuery(request)));
  } catch (error) { return errorResponse(error); }
}
