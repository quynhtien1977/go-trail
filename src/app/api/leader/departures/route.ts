import { getCurrentActor } from "@/server/auth/session";
import { errorResponse, json } from "@/server/http";
import { accountDataService } from "@/server/services/account-data";

export async function GET() {
  try { return json(await accountDataService.listLeaderDepartures(await getCurrentActor())); }
  catch (error) { return errorResponse(error); }
}
