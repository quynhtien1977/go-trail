import { getDb } from "@/server/db";
import { errorResponse, json, parseId } from "@/server/http";
import { readPublicTrip } from "@/server/services/catalog";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return json(await readPublicTrip(getDb(), parseId(id)));
  } catch (error) { return errorResponse(error); }
}
