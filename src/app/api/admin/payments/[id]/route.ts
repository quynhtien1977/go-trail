import { getCurrentActor } from "@/server/auth/session";
import { requireRole } from "@/server/auth/authorization";
import { errorResponse, json, parseId } from "@/server/http";
import { adminPaymentService } from "@/server/services/admin-payments";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await getCurrentActor();
    requireRole(actor, ["Admin"]);
    const { id } = await context.params;
    return json(await adminPaymentService.readAdminPayment(actor, parseId(id)));
  } catch (error) {
    return errorResponse(error);
  }
}
