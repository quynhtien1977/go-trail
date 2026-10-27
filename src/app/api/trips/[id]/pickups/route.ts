import { errorResponse, json, parseId, readQuery } from "@/server/http";
import { catalogService } from "@/server/services/catalog";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return json(await catalogService.listPublicPickups(parseId(id), readQuery(request)));
  } catch (error) { return errorResponse(error); }
}
