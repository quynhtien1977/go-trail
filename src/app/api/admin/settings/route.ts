import { getCurrentActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { errorResponse, json } from "@/server/http";
import { listSettings } from "@/server/services/admin";

export async function GET() {
  try { return json(await listSettings(getDb(), await getCurrentActor())); }
  catch (error) { return errorResponse(error); }
}
