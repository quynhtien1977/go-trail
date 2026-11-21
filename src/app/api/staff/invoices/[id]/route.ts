import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json, parseId } from "@/server/http";
import { staffInvoiceService } from "@/server/services/staff-invoices";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["RouteMgr"]);
    const { id } = await context.params;
    return json(await staffInvoiceService.readStaffInvoice(actor, parseId(id)));
  } catch (error) {
    return errorResponse(error);
  }
}
