import { getCurrentActor } from "@/server/auth/session";
import { errorResponse, json, parseId } from "@/server/http";
import { accountDataService } from "@/server/services/account-data";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    const { id } = await context.params;
    return json(await accountDataService.readCustomerInvoice(actor, parseId(id)));
  } catch (error) { return errorResponse(error); }
}
