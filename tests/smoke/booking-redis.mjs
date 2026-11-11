import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import nextEnv from "@next/env";
import { getAuthRedis } from "../../src/server/auth/redis.ts";
import { createBookingRateLimiter } from "../../src/server/services/booking-rate-limit.ts";
import { createRateLimiter } from "../../src/server/auth/rate-limit.ts";

// Explicit integration: only unique, owned test keys; never application budgets.
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const namespace = `go-trail:test:booking:${randomBytes(12).toString("hex")}`;
const secret = randomBytes(32).toString("hex");
const ownedKeys = new Set();
let redis;
try {
  redis = getAuthRedis(); assert.equal(await redis.ping(), "PONG");
  const store = { async eval(script, keys, args) {
    assert.ok(keys.every(key => key.startsWith(namespace + ":")));
    keys.forEach(key => ownedKeys.add(key));
    return redis.eval(script, keys, args);
  } };
  const consume = createBookingRateLimiter(store, namespace, secret);
  const attempts = await Promise.allSettled(Array.from({ length: 24 }, () => consume(1001)));
  assert.equal(attempts.filter(r => r.status === "fulfilled").length, 10);
  assert.ok(attempts.filter(r => r.status === "rejected").every(r => r.reason.code === "RATE_LIMITED"));
  const [key] = ownedKeys; assert.equal(await redis.get(key), 11);
  const ttl = await redis.pttl(key); assert.ok(ttl > 0 && ttl <= 60000);
  await assert.rejects(consume(1001), { code: "RATE_LIMITED" });
  assert.ok(await redis.pttl(key) < ttl, "Blocked attempts cannot extend the budget");
  await redis.pexpire(key, 100); await new Promise(resolve => setTimeout(resolve, 250));
  await consume(1001); assert.ok(await redis.pttl(key) > 58000);
  await consume(1002);
  assert.deepEqual(await createRateLimiter(store, namespace)("login-email", "1001", secret, 10), { allowed: true, retry_after: 900 });
  const sharedSource = Array.from({ length: 60 }, (_, index) => consume(2000 + Math.floor(index / 10), "192.0.2.1"));
  const sourceResults = await Promise.allSettled(sharedSource);
  assert.equal(sourceResults.filter(r => r.status === "fulfilled").length, 50);
  assert.ok(sourceResults.filter(r => r.status === "rejected").every(r => r.reason.code === "RATE_LIMITED"));
  await consume(3000, "192.0.2.2");
  assert.ok([...ownedKeys].every(key => /:v1:[a-f0-9]{64}$/.test(key) && !key.includes("192.0.2.")));
  await redis.persist(key); await assert.rejects(consume(1001), { code: "BOOKING_UNAVAILABLE" });
  await redis.set(key, "invalid", { px: 10000 }); await assert.rejects(consume(1001), { code: "BOOKING_UNAVAILABLE" });
  console.log("PASS: real Redis K04 concurrent account/source budgets, TTL/reset, Auth isolation, privacy and corrupted-counter rejection");
} catch {
  console.error("FAIL: booking Redis integration; provider details suppressed.");
  process.exitCode = 1;
} finally {
  if (redis && ownedKeys.size) {
    try { await redis.del(...ownedKeys); }
    catch { console.error("FAIL: owned test-key cleanup; app budgets were not touched."); process.exitCode = 1; }
  }
}
