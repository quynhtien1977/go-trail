import { getDb } from "@/server/db";
import { errorResponse, json, readQuery } from "@/server/http";
import { listPublicTrips } from "@/server/services/catalog";

export async function GET(request: Request) {
  try { return json(await listPublicTrips(getDb(), readQuery(request))); }
  catch (error) { return errorResponse(error); }
}
