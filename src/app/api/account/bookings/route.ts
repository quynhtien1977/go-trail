import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json } from "@/server/http";
import { customersService } from "@/server/services/customers";

export async function GET() {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Customer"]);
    return json(await customersService.listOwnBookings(actor));
  } catch (error) { return errorResponse(error); }
}
