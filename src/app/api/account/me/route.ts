import { getCurrentActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { errorResponse, json } from "@/server/http";
import { readCurrentProfile } from "@/server/services/accounts";

export async function GET() {
  try {
    const actor = await getCurrentActor();
    return json(await readCurrentProfile(getDb(), actor));
  } catch (error) { return errorResponse(error); }
}
