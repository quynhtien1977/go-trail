import { getCurrentActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { errorResponse, json } from "@/server/http";

export async function GET() {
  try {
    const actor = await getCurrentActor();
    return json(await getDb().user.findUniqueOrThrow({ where: { user_id: actor.user_id },
      select: { user_id: true, email: true, full_name: true, phone: true, role: true, status: true } }));
  } catch (error) { return errorResponse(error); }
}
