import "server-only";
import type { DataClient, Transaction } from "./database";

export function visibleDeparture(db: DataClient, id: number, role: string, userId: number) {
  return db.departure.findFirst({ where: { departure_id: id,
    ...(role === "RouteMgr" ? { invoice_owner_user_id: userId } : {}),
    ...(role === "Leader" ? { staff: { some: { role_in_trip: "Leader", staff: { user_id: userId } } } } : {}),
  }, select: { departure_id: true } });
}

export async function assignedRecipient(tx: Transaction, departureId: number, recipientId: number) {
  const rows = await tx.$queryRaw<{ staff_id: number }[]>`
    SELECT a.staff_id FROM departure_staff a JOIN staff s USING (staff_id)
    WHERE a.departure_id = ${departureId} AND a.staff_id = ${recipientId} AND s.status = 'Active'
    FOR SHARE OF a, s`;
  return rows.length > 0;
}

export function departureBalance(db: DataClient, departureId: number, itemId: number | null = null) {
  return db.$queryRaw<{ item_id: number; name: string; unit: string; issued: number; returned: number; remaining: number }[]>`
    SELECT i.item_id, i.name, i.unit,
      SUM(CASE WHEN t.txn_type = 'Issue' THEN t.quantity ELSE 0 END)::int AS issued,
      SUM(CASE WHEN t.txn_type = 'Return' THEN t.quantity ELSE 0 END)::int AS returned,
      SUM(CASE WHEN t.txn_type = 'Issue' THEN t.quantity ELSE -t.quantity END)::int AS remaining
    FROM supply_transactions t JOIN supply_items i USING (item_id)
    WHERE t.departure_id = ${departureId} AND (${itemId}::int IS NULL OR i.item_id = ${itemId})
    GROUP BY i.item_id ORDER BY i.item_id`;
}
