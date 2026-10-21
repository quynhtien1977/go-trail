import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createTestDatabase } from "./helpers/test-database.mjs";

test("isolated database drains deferred socket-close work before closing PGlite", async (t) => {
  const stop = PGLiteSocketServer.prototype.stop;
  let deferredClose, callbackError;
  t.mock.method(PGLiteSocketServer.prototype, "stop", async function () {
    await stop.call(this);
    // Model the library's deferred close handler, which can still use the DB
    // (for example to roll back a disconnected client's transaction).
    deferredClose = nextTurn().then(() => this.db.exec("SELECT 1"))
      .catch(error => { callbackError = error; });
  });
  const database = await createTestDatabase();
  await database.client.$queryRaw`SELECT 1`;
  try {
    await database.close();
    await deferredClose;
    assert.equal(callbackError, undefined, "Closing PGlite must wait for deferred socket-close DB work.");
    assert.equal(database.sql.closed, true);
  } finally {
    if (deferredClose) await deferredClose;
    if (!database.sql.closed) await database.close();
  }
});
