import "server-only";
import { parseReport } from "@/schemas/report";
import { requireActor, requireRole, type Actor } from "@/server/auth/authorization";
import { revenueReport } from "@/server/repositories/revenue";
import type { Database } from "@/server/repositories/database";
import { bindDb } from "./bind-db";

export async function readRevenue(db: Database, identity: Actor, input: unknown) {
  requireRole(await requireActor(db, identity), ["Admin"]);
  const { period, group } = parseReport(input, true);
  return revenueReport(db, period, group);
}
export const revenueService = bindDb({ readRevenue });
