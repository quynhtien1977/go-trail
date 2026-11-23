import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json, readQuery } from "@/server/http";
import { adminPaymentService } from "@/server/services/admin-payments";

export async function GET(request: Request) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Admin"]);
    // Strict query: unknown or repeated parameters are rejected instead of silently ignored.
    return json(await adminPaymentService.listAdminPayments(actor, readQuery(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
