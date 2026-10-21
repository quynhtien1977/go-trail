import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createTestDatabase } from "./helpers/test-database.mjs";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));

test("seed CLI creates five demo roles and reruns preserve the migrated locked accountant", async () => {
  const database = await createTestDatabase();
  const seed = (password) => run(process.execPath,
    ["--conditions=react-server", "--import", "tsx", "prisma/seed.ts"], {
      cwd: root, timeout: 60000, maxBuffer: 128 * 1024,
      env: { ...process.env, NODE_ENV: "development", DATABASE_URL: database.connectionString,
        DIRECT_URL: database.connectionString, SEED_PASSWORD: password },
    });
  try {
    await seed("isolated-fixture-password-for-a02");
    const users = await database.client.user.findMany({ orderBy: { user_id: "asc" } });
    assert.deepEqual(users.map((user) => user.role), ["Customer", "Leader", "RouteMgr", "HRMgr", "Admin"]);
    assert.equal(await database.client.trip.count(), 8);
    assert.equal(await database.client.staff.count(), 3);
    assert.equal(await database.client.departure.count(), 3);
    // A pre-existing demo Accountant has already been mapped by the migration.
    await database.client.user.create({ data: { email: "accountant@go-trail.example.test", role: "Customer", status: "Locked",
      auth_version: 3, full_name: "Migrated fixture", phone: "0900000000", password_hash: "unchanged-fixture-hash" } });
    const before = await database.client.user.findMany({ orderBy: { user_id: "asc" } });
    await seed("different-isolated-fixture-password-a02");
    assert.deepEqual(await database.client.user.findMany({ orderBy: { user_id: "asc" } }), before);
    assert.equal(await database.client.user.count(), 6, "Five supported demos plus the preserved locked legacy identity");
    assert.equal(await database.client.trip.count(), 8);
    assert.equal(await database.client.staff.count(), 3);
    assert.equal(await database.client.departure.count(), 3);
    assert.deepEqual(users.map((user) => user.email), ["customer", "leader", "routemgr", "hrmgr", "admin"]
      .map((role) => `${role}@go-trail.example.test`));
  } finally { await database.close(); }
});
