import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json, readQuery } from "@/server/http";
import { customersService } from "@/server/services/customers";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    return json(await customersService.listCustomers(actor, readQuery(request)));
  } catch (error) { return errorResponse(error); }
}
