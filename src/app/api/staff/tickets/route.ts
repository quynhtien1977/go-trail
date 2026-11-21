import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json } from "@/server/http";
import { staffInvoiceService } from "@/server/services/staff-invoices";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    const url = new URL(request.url);
    const query = {
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
      ticket_code: url.searchParams.get("ticket_code") || undefined,
      departure_id: url.searchParams.get("departure_id") || undefined,
      passenger_phone: url.searchParams.get("passenger_phone") || undefined,
      passenger_name: url.searchParams.get("passenger_name") || undefined,
      check_in_status: url.searchParams.get("check_in_status") || undefined,
      status: url.searchParams.get("status") || undefined,
    };
    return json(await staffInvoiceService.searchStaffTickets(actor, query));
  } catch (error) {
    return errorResponse(error);
  }
}
