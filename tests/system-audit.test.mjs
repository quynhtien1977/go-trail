import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { writeAudit, writeCronDeparturesClosed } from "../src/server/audit.ts";

test("Q03 system audit records cron explicitly while human audit still requires a real user", async () => {
  const database = await createTestDatabase();
  try {
    const db = database.client;
    const user = await db.user.create({ data: { email: "cron-audit@example.test", password_hash: "fixture",
      full_name: "Admin fixture", phone: "0901234567", role: "Admin" } });
    await writeCronDeparturesClosed(db, [{ record_id: 42, reason: "deadline" }]);
    const system = await db.auditLog.findFirstOrThrow();
    assert.equal(system.user_id, null);
    assert.equal(system.table_name, "departures");
    assert.deepEqual(JSON.parse(system.description), {
      action: "DepartureStatusChanged", record_id: 42, from: "Open", to: "Closed", source: "cron", reason: "deadline",
    });
    await writeAudit(db, user.user_id, { action: "AccountStatusChanged", record_id: user.user_id, from: "Active", to: "Locked" });
    assert.equal(await db.auditLog.count(), 2);
    await assert.rejects(writeAudit(db, null, { action: "RoleChanged", record_id: user.user_id, from: "Customer", to: "Admin" }),
      { code: "INVALID_INPUT", status: 422 });
    await assert.rejects(writeCronDeparturesClosed(db, [{ record_id: 42, reason: "unexpected" }]), { code: "INVALID_INPUT", status: 422 });
    await assert.rejects(writeCronDeparturesClosed(db, [{ record_id: 0, reason: "deadline" }]), { code: "INVALID_INPUT", status: 422 });
    assert.equal(await db.auditLog.count(), 2);
  } finally { await database.close(); }
});
