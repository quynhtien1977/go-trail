import { getDb } from "@/server/db";
import { errorResponse, json, parseId, readQuery } from "@/server/http";
import { listPublicDepartures } from "@/server/services/catalog";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return json(await listPublicDepartures(getDb(), parseId(id), readQuery(request)));
  } catch (error) { return errorResponse(error); }
}
