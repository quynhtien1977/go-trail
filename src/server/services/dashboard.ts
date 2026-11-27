import "server-only";
import { z } from "zod";
import { reportPeriod, reportFilters } from "@/schemas/report";
import { requireActor, requireRole, type Actor } from "@/server/auth/authorization";
import { AppError } from "@/server/errors";
import * as dashboard from "@/server/repositories/dashboard";
import { visibleDeparture } from "@/server/repositories/departure-supplies";
import { revenueReport } from "@/server/repositories/revenue";
import { inTransaction, type Database } from "@/server/repositories/database";
import { bindDb } from "./bind-db";

const cursor = z.string().regex(/^\d{1,10}$/).transform(Number).pipe(z.number().max(2147483647)).optional();
const query = reportFilters.extend({ stock_after: cursor, supplies_after: cursor });

function page<T extends { item_id: number }>(rows: T[]) {
  return { items: rows.slice(0, 50), next_cursor: rows.length > 50 ? rows[49].item_id : null };
}

export async function readDashboard(db: Database, identity: Actor, input: unknown) {
  return inTransaction(db, async tx => {
    const actor = await requireActor(tx, identity);
    requireRole(actor, ["RouteMgr", "HRMgr"]);
    const parsed = query.safeParse(input);
    if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
    const { stock_after, supplies_after, ...filters } = parsed.data;
    const period = reportPeriod(filters);
    const owner = actor.role === "RouteMgr" ? actor.user_id : undefined;
    if (period.departureId && !await visibleDeparture(tx, period.departureId, actor.role, actor.user_id)) {
      throw new AppError("NOT_FOUND", 404);
    }
    return {
      operations: await dashboard.operations(tx, period, owner),
      supplies_in_period: page(await dashboard.periodSupplies(tx, period, supplies_after ?? 0, owner)),
      ...(actor.role !== "HRMgr" && { passengers: await dashboard.passengers(tx, period, owner) }),
      ...(actor.role !== "RouteMgr" && { warehouse_low_stock_now: page(await dashboard.lowStock(tx, stock_after ?? 0)) }),
      ...(actor.role === "Admin" && { revenue: (await revenueReport(tx, period, "day")).totals }),
    };
  }, { isolationLevel: "RepeatableRead" });
}
export const dashboardService = bindDb({ readDashboard });
