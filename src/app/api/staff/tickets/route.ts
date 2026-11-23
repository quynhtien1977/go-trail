import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json, readQuery } from "@/server/http";
import { staffInvoiceService } from "@/server/services/staff-invoices";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    // Strict query: unknown or repeated parameters are rejected instead of silently ignored.
    return json(await staffInvoiceService.searchStaffTickets(actor, readQuery(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
