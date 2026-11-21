import "server-only";
import type { z } from "zod";
import { inTransaction, type Database } from "@/server/repositories/database";
import * as inventory from "@/server/repositories/inventory";
import {
  createSupplyItemSchema,
  updateSupplyItemSchema,
  receiveSupplySchema,
  supplyItemQuerySchema,
  type SupplyItemDto,
  type SupplyTransactionDto,
} from "@/schemas/inventory";
import type { Page } from "@/schemas/catalog";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { bindDb } from "./bind-db";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}

function assertId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new AppError("INVALID_INPUT", 422);
}

function itemDto(item: { item_id: number; name: string; category: string; unit: string; is_active: boolean; created_at: Date }, onHand: number): SupplyItemDto {
  return {
    item_id: item.item_id,
    name: item.name,
    category: item.category as SupplyItemDto["category"],
    unit: item.unit,
    is_active: item.is_active,
    on_hand: onHand,
    created_at: item.created_at.toISOString(),
  };
}

function txnDto(txn: { txn_id: number; item_id: number; txn_type: string; quantity: number; departure_id: number | null; created_by_user_id: number; idempotency_key: string; note: string | null; created_at: Date }): SupplyTransactionDto {
  return {
    txn_id: txn.txn_id,
    item_id: txn.item_id,
    txn_type: txn.txn_type as SupplyTransactionDto["txn_type"],
    quantity: txn.quantity,
    departure_id: txn.departure_id,
    created_by_user_id: txn.created_by_user_id,
    idempotency_key: txn.idempotency_key,
    note: txn.note,
    created_at: txn.created_at.toISOString(),
  };
}

async function hrOrAdmin(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["HRMgr"]);
  return actor;
}

async function staffReader(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["RouteMgr", "HRMgr"]);
  return actor;
}

export async function createSupplyItem(db: Database, identity: Actor, input: unknown): Promise<SupplyItemDto> {
  const data = parse(createSupplyItemSchema, input);
  return inTransaction(db, async (tx) => {
    const actor = await hrOrAdmin(tx, identity);
    const existing = await inventory.findSupplyItemByName(tx, data.name);
    if (existing) throw new AppError("RESOURCE_CONFLICT", 409);

    let created;
    try {
      created = await inventory.createSupplyItem(tx, data);
    } catch (error) {
      if (inventory.isUniqueConflict(error)) throw new AppError("RESOURCE_CONFLICT", 409);
      throw error;
    }
    await writeAudit(tx, actor.user_id, {
      action: "SupplyItemCreated",
      record_id: created.item_id,
    });
    return itemDto(created, 0);
  });
}

export async function updateSupplyItem(db: Database, identity: Actor, itemId: number, input: unknown): Promise<SupplyItemDto> {
  assertId(itemId);
  const data = parse(updateSupplyItemSchema, input);
  return inTransaction(db, async (tx) => {
    const actor = await hrOrAdmin(tx, identity);
    const current = await inventory.lockSupplyItem(tx, itemId);
    if (!current) throw new AppError("NOT_FOUND", 404);

    if (data.name && data.name !== current.name) {
      const existing = await inventory.findSupplyItemByName(tx, data.name);
      if (existing && existing.item_id !== itemId) throw new AppError("RESOURCE_CONFLICT", 409);
    }

    let updated;
    try {
      updated = await inventory.updateSupplyItem(tx, itemId, data);
    } catch (error) {
      if (inventory.isUniqueConflict(error)) throw new AppError("RESOURCE_CONFLICT", 409);
      throw error;
    }
    await writeAudit(tx, actor.user_id, {
      action: "SupplyItemUpdated",
      record_id: itemId,
    });
    const onHand = await inventory.getItemStock(tx, itemId);
    return itemDto(updated, onHand);
  });
}

export async function readSupplyItem(db: Database, identity: Actor, itemId: number): Promise<SupplyItemDto> {
  assertId(itemId);
  await staffReader(db, identity);
  const item = await inventory.findSupplyItem(db, itemId);
  if (!item) throw new AppError("NOT_FOUND", 404);
  const onHand = await inventory.getItemStock(db, itemId);
  return itemDto(item, onHand);
}

export async function listSupplyItems(db: Database, identity: Actor, input: unknown = {}): Promise<Page<SupplyItemDto>> {
  const query = parse(supplyItemQuerySchema, input);
  await staffReader(db, identity);
  const { items, totalItems } = await inventory.pageSupplyItems(db, query);
  return {
    items: items.map((i) => itemDto(i, i.on_hand)),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

export async function receiveSupply(db: Database, identity: Actor, input: unknown): Promise<SupplyTransactionDto> {
  const data = parse(receiveSupplySchema, input);
  return inTransaction(db, async (tx) => {
    const actor = await hrOrAdmin(tx, identity);

    // Idempotency check before lock
    const existing = await inventory.findSupplyTransactionByKey(tx, data.idempotency_key);
    if (existing) {
      const samePayload = existing.item_id === data.item_id
        && existing.quantity === data.quantity
        && existing.txn_type === "Receive"
        && (existing.note ?? null) === (data.note?.trim() || null);
      if (samePayload) return txnDto(existing);
      throw new AppError("RESOURCE_CONFLICT", 409);
    }

    const item = await inventory.lockSupplyItem(tx, data.item_id);
    if (!item) throw new AppError("NOT_FOUND", 404);
    if (!item.is_active) throw new AppError("RESOURCE_CONFLICT", 409);

    let created;
    try {
      created = await inventory.insertSupplyTransaction(tx, {
        item_id: data.item_id,
        txn_type: "Receive",
        quantity: data.quantity,
        departure_id: null,
        created_by_user_id: actor.user_id,
        idempotency_key: data.idempotency_key,
        note: data.note?.trim() || null,
      });
    } catch (error) {
      if (inventory.isUniqueConflict(error)) {
        const retry = await inventory.findSupplyTransactionByKey(tx, data.idempotency_key);
        if (retry) {
          const samePayload = retry.item_id === data.item_id
            && retry.quantity === data.quantity
            && retry.txn_type === "Receive"
            && (retry.note ?? null) === (data.note?.trim() || null);
          if (samePayload) return txnDto(retry);
        }
        throw new AppError("RESOURCE_CONFLICT", 409);
      }
      throw error;
    }

    await writeAudit(tx, actor.user_id, {
      action: "SupplyReceived",
      record_id: created.txn_id,
      item_id: data.item_id,
      quantity: data.quantity,
    });

    return txnDto(created);
  });
}

export const inventoryService = bindDb({
  createSupplyItem,
  updateSupplyItem,
  readSupplyItem,
  listSupplyItems,
  receiveSupply,
});
