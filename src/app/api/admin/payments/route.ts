import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json } from "@/server/http";
import { adminPaymentService } from "@/server/services/admin-payments";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Admin"]);
    const url = new URL(request.url);
    const query = {
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
      status: url.searchParams.get("status") || undefined,
      transaction_id: url.searchParams.get("transaction_id") || undefined,
      reference_code: url.searchParams.get("reference_code") || undefined,
      payment_code: url.searchParams.get("payment_code") || undefined,
      from_date: url.searchParams.get("from_date") || undefined,
      to_date: url.searchParams.get("to_date") || undefined,
    };
    return json(await adminPaymentService.listAdminPayments(actor, query));
  } catch (error) {
    return errorResponse(error);
  }
}
