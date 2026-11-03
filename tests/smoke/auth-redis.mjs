import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import nextEnv from "@next/env";
import { getAuthRedis } from "../../src/server/auth/redis.ts";
import { createRateLimiter } from "../../src/server/auth/rate-limit.ts";

// Explicit integration command: writes only random test keys, never app budgets.
// Secrets/endpoints/provider errors are intentionally absent from output.
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const namespace = `go-trail:test:redis:${randomBytes(12).toString("hex")}`;
const secret = randomBytes(32).toString("hex");
const ownedKeys = new Set();
let redis;
try {
  redis = getAuthRedis();
  assert.equal(await redis.ping(), "PONG");
  const store = { async eval(script, keys, args) {
    assert.ok(keys.every((key) => key.startsWith(namespace + ":")));
    for (const key of keys) ownedKeys.add(key);
    return redis.eval(script, keys, args);
  } };
  const consume = createRateLimiter(store, namespace);
  const results = await Promise.all(Array.from({ length: 24 }, () => consume("login-email", "private@example.test", secret, 10)));
  assert.equal(results.filter((result) => result.allowed).length, 10);
  const [key] = ownedKeys;
  assert.equal(await redis.get(key), 11);
  const firstTtl = await redis.pttl(key);
  assert.ok(firstTtl > 0 && firstTtl <= 900000);
  assert.equal((await consume("login-email", "private@example.test", secret, 10)).allowed, false);
  assert.ok(await redis.pttl(key) < firstTtl, "Blocked attempts cannot extend the TTL");
  await redis.pexpire(key, 150);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal((await consume("login-email", "private@example.test", secret, 10)).allowed, true);
  assert.ok(await redis.pttl(key) > 890000, "Expired bucket starts a fresh fifteen-minute window");
  await consume("registration-email", "private@example.test", secret, 3);
  await consume("login-email", "other@example.test", secret, 10);
  await createRateLimiter(store, namespace + ":preview")("login-email", "private@example.test", secret, 10);
  assert.equal(ownedKeys.size, 4);
  assert.ok([...ownedKeys].every((key) => /:v1:[a-f0-9]{64}$/.test(key) && !key.includes("@")));
  // Corrupt/persistent counters must fail closed rather than reset the budget.
  await redis.persist(key);
  await assert.rejects(consume("login-email", "private@example.test", secret, 10), { code: "AUTH_UNAVAILABLE" });
  await redis.set(key, "invalid", { px: 10000 });
  await assert.rejects(consume("login-email", "private@example.test", secret, 10), { code: "AUTH_UNAVAILABLE" });
  console.log("PASS: Upstash REST, atomic concurrent budget, bounded counter, TTL/reset, namespace/privacy and corrupted-counter rejection");
} catch {
  console.error("FAIL: Redis integration; provider details suppressed. Check configuration/connectivity and rerun.");
  process.exitCode = 1;
} finally {
  if (redis && ownedKeys.size) {
    try { await redis.del(...ownedKeys); }
    catch {
      console.error("FAIL: test-key cleanup; app keys were not touched.");
      process.exitCode = 1;
    }
  }
}
