import "server-only";
import { movementSchema } from "@/schemas/inventory";
import { requireActor, requireRole, type Actor } from "@/server/auth/authorization";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { assignedRecipient, departureBalance, lockDepartureForSupply, visibleDeparture, wasIssuedToRecipient } from "@/server/repositories/departure-supplies";
import { inTransaction, type Database } from "@/server/repositories/database";
import * as inventory from "@/server/repositories/inventory";
import { bindDb } from "./bind-db";

export async function readSupplies(db: Database, identity: Actor, id: number) {
  return inTransaction(db, async tx => {
    const actor = await requireActor(tx, identity);
    requireRole(actor, ["HRMgr", "Leader", "RouteMgr"]);
    if (!await visibleDeparture(tx, id, actor.role, actor.user_id)) throw new AppError("NOT_FOUND", 404);
    return { items: await departureBalance(tx, id) };
  }, { isolationLevel: "RepeatableRead" });
}

export async function moveSupply(db: Database, identity: Actor, id: number, type: "Issue" | "Return", input: unknown) {
  return inTransaction(db, async tx => {
    const actor = await requireActor(tx, identity);
    requireRole(actor, ["HRMgr"]);
    const parsed = movementSchema.safeParse(input);
    if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
    const data = parsed.data;
    // A concurrent trip closure must complete before we validate whether a new issue is allowed.
    const departure = await lockDepartureForSupply(tx, id);
    if (!departure) throw new AppError("NOT_FOUND", 404);
    const item = await inventory.lockSupplyItem(tx, data.item_id);
    if (!item) throw new AppError("NOT_FOUND", 404);
    const prior = await inventory.findSupplyTransactionByKey(tx, data.idempotency_key);
    if (prior) {
      if (prior.departure_id === id && prior.txn_type === type && prior.item_id === data.item_id &&
          prior.quantity === data.quantity && prior.recipient_staff_id === data.recipient_staff_id &&
          prior.created_by_user_id === actor.user_id && prior.note === data.note) return prior;
      throw new AppError("RESOURCE_CONFLICT", 409);
    }
    if (type === "Issue" && !["Draft", "Open", "Closed", "Confirmed", "Running"].includes(departure.status)) {
      throw new AppError("RESOURCE_CONFLICT", 409);
    }
    const assigned = await assignedRecipient(tx, id, data.recipient_staff_id, type === "Return");
    // A former assignee can return the same item they actually received before reassignment.
    if (!assigned && !(type === "Return" && await wasIssuedToRecipient(tx, id, data.item_id, data.recipient_staff_id))) {
      throw new AppError("NOT_FOUND", 404);
    }
    if (type === "Issue" && !item.is_active) throw new AppError("RESOURCE_CONFLICT", 409);
    const available = type === "Issue" ? await inventory.getItemStock(tx, item.item_id)
      : (await departureBalance(tx, id, item.item_id))[0]?.remaining ?? 0;
    if (data.quantity > available) throw new AppError("RESOURCE_CONFLICT", 409);
    try {
      const row = await inventory.insertSupplyTransaction(tx, {
        ...data, departure_id: id, txn_type: type, created_by_user_id: actor.user_id,
      });
      await writeAudit(tx, actor.user_id, { action: type === "Issue" ? "SupplyIssued" : "SupplyReturned",
        record_id: row.txn_id, item_id: item.item_id, departure_id: id, quantity: data.quantity });
      return row;
    } catch (error) {
      if (inventory.isUniqueConflict(error)) throw new AppError("RESOURCE_CONFLICT", 409);
      throw error;
    }
  });
}
export const departureSupplyService = bindDb({ readSupplies, moveSupply });
