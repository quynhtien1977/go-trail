import "server-only";
import type { AccountDatabase } from "./accounts";

export function insertAudit(db: AccountDatabase, data: { user_id: number; action: string; table_name: string; record_id: string; description: string }) {
  return db.auditLog.create({ data });
}
