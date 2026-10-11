import { getCurrentActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { errorResponse, json } from "@/server/http";
import { listLeaderDepartures } from "@/server/services/account-data";

export async function GET() {
  try { return json(await listLeaderDepartures(getDb(), await getCurrentActor())); }
  catch (error) { return errorResponse(error); }
}
