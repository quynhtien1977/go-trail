import "server-only";
import { Prisma, type SupplyCategory } from "@/generated/prisma/client";
import type { DataClient, Transaction } from "./database";

export const stockDelta = Prisma.sql`CASE WHEN txn_type IN ('Receive', 'Return') THEN quantity ELSE -quantity END`;

export function isUniqueConflict(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "P2002";
}

export function findSupplyItem(db: DataClient, itemId: number) {
  return db.supplyItem.findUnique({
    where: { item_id: itemId },
  });
}

export function findSupplyItemByName(db: DataClient, name: string) {
  return db.supplyItem.findUnique({
    where: { name },
  });
}

export async function lockSupplyItem(tx: Transaction, itemId: number) {
  const rows = await tx.$queryRaw<{ item_id: number }[]>`
    SELECT item_id FROM supply_items WHERE item_id = ${itemId} FOR UPDATE
  `;
  if (!rows.length) return null;
  return findSupplyItem(tx, itemId);
}

export function createSupplyItem(tx: Transaction, data: Prisma.SupplyItemUncheckedCreateInput) {
  return tx.supplyItem.create({ data });
}

export function updateSupplyItem(tx: Transaction, itemId: number, data: Prisma.SupplyItemUncheckedUpdateInput) {
  return tx.supplyItem.update({
    where: { item_id: itemId },
    data,
  });
}

export async function getItemStock(db: DataClient, itemId: number): Promise<number> {
  const rows = await db.$queryRaw<{ on_hand: number | null }[]>`
    SELECT COALESCE(SUM(${stockDelta}), 0)::int AS on_hand
    FROM supply_transactions
    WHERE item_id = ${itemId}
  `;
  return rows[0]?.on_hand ?? 0;
}

export async function pageSupplyItems(
  db: DataClient,
  query: { category?: SupplyCategory; is_active?: boolean; page: number; pageSize: number }
) {
  const where: Prisma.SupplyItemWhereInput = {
    ...(query.category ? { category: query.category } : {}),
    ...(query.is_active !== undefined ? { is_active: query.is_active } : {}),
  };
  const rows = await db.supplyItem.findMany({
    where,
    orderBy: [{ item_id: "asc" }],
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });
  const totalItems = await db.supplyItem.count({ where });

  const itemIds = rows.map((r) => r.item_id);
  const stockMap: Record<number, number> = {};
  if (itemIds.length > 0) {
    const stockRows = await db.$queryRaw<{ item_id: number; on_hand: number }[]>`
      SELECT item_id, COALESCE(SUM(${stockDelta}), 0)::int AS on_hand
      FROM supply_transactions
      WHERE item_id = ANY(${itemIds})
      GROUP BY item_id
    `;
    for (const s of stockRows) {
      stockMap[s.item_id] = s.on_hand;
    }
  }

  const items = rows.map((r) => ({
    ...r,
    on_hand: stockMap[r.item_id] ?? 0,
  }));
  return { items, totalItems };
}

export function findSupplyTransactionByKey(db: DataClient, key: string) {
  return db.supplyTransaction.findUnique({
    where: { idempotency_key: key },
  });
}

export function insertSupplyTransaction(tx: Transaction, data: Prisma.SupplyTransactionUncheckedCreateInput) {
  return tx.supplyTransaction.create({ data });
}
