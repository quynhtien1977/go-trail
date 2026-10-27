import { errorResponse, json, readQuery } from "@/server/http";
import { catalogService } from "@/server/services/catalog";

export async function GET(request: Request) {
  try { return json(await catalogService.listPublicTrips(readQuery(request))); }
  catch (error) { return errorResponse(error); }
}
