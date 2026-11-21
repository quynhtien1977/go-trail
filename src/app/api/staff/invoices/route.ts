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
      status: url.searchParams.get("status") || undefined,
      departure_id: url.searchParams.get("departure_id") || undefined,
      responsible_user_id: url.searchParams.get("responsible_user_id") || undefined,
      search: url.searchParams.get("search") || undefined,
      from_date: url.searchParams.get("from_date") || undefined,
      to_date: url.searchParams.get("to_date") || undefined,
    };
    return json(await staffInvoiceService.listStaffInvoices(actor, query));
  } catch (error) {
    return errorResponse(error);
  }
}
