import { errorResponse, json, parseId } from "@/server/http";
import { catalogService } from "@/server/services/catalog";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return json(await catalogService.readPublicTrip(parseId(id)));
  } catch (error) { return errorResponse(error); }
}
