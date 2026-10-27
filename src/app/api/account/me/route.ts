import { getCurrentActor } from "@/server/auth/session";
import { errorResponse, json } from "@/server/http";
import { accountsService } from "@/server/services/accounts";

export async function GET() {
  try {
    const actor = await getCurrentActor();
    return json(await accountsService.readCurrentProfile(actor));
  } catch (error) { return errorResponse(error); }
}
