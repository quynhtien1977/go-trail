import { errorResponse, json, parseId } from "@/server/http";
import { departurePickupService } from "@/server/services/departure-pickups";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return json(await departurePickupService.readPublicDeparturePickups(parseId(id)));
  } catch (error) { return errorResponse(error); }
}
