import { getDb } from "@/server/db";
import { errorResponse, json, parseId } from "@/server/http";
import { readPublicSeatMap } from "@/server/services/seat-map";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return json(await readPublicSeatMap(getDb(), parseId(id)));
  } catch (error) { return errorResponse(error); }
}
