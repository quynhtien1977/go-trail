import { getCurrentActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { errorResponse, json, readQuery } from "@/server/http";
import { listAuditLogs } from "@/server/services/admin";

export async function GET(request: Request) {
  try { return json(await listAuditLogs(getDb(), await getCurrentActor(), readQuery(request))); }
  catch (error) { return errorResponse(error); }
}
