import assert from "node:assert/strict";
import { test } from "node:test";
import { createRateLimiter, getRateLimitNamespace } from "../src/server/auth/rate-limit.ts";
import { getRedisConfig } from "../src/server/auth/redis.ts";
import { errorResponse } from "../src/server/http.ts";

const secret = "isolated-rate-limit-secret-at-least-32-characters";

test("Redis keys separate environments/scopes/identities and conceal email/IP; retry seconds round up", async () => {
  const keys = [];
  const store = { async eval(_script, [key]) { keys.push(key); return [1, 1501]; } };
  for (const namespace of ["go-trail:auth:development", "go-trail:auth:production"]) {
    const consume = createRateLimiter(store, namespace);
    assert.deepEqual(await consume("login-email", "private@example.test", secret, 10), { allowed: true, retry_after: 2 });
    await consume("registration-email", "private@example.test", secret, 3);
    await consume("login-source", "192.0.2.1", secret, 50);
  }
  assert.equal(new Set(keys).size, 6);
  assert.ok(keys.every((key) => /:v1:[a-f0-9]{64}$/.test(key) && !key.includes("@") && !key.includes("192.0.2.1")));
});

test("budget exhaustion is distinct from Redis errors; all failures close auth without secret disclosure", async () => {
  const denied = createRateLimiter({ async eval() { return [11, 900000]; } }, "test:denied");
  assert.deepEqual(await denied("login-email", "private@example.test", secret, 10), { allowed: false, retry_after: 900 });
  for (const value of [new Error("provider token=do-not-disclose"), new DOMException("private endpoint", "TimeoutError"),
    null, [], [0, 100], [1, -1], [1, 900001], [12, 100], [1.5, 100], [1, "100"]]) {
    const consume = createRateLimiter({ async eval() { if (value instanceof Error) throw value; return value; } }, "test:failure");
    await assert.rejects(consume("login-email", "private@example.test", secret, 10), (error) => {
      assert.equal(error.code, "AUTH_UNAVAILABLE");
      assert.equal(error.status, 503);
      assert.ok(!error.message.includes("do-not-disclose") && !error.message.includes("private endpoint"));
      return true;
    });
  }
  const error = await createRateLimiter({ async eval() { throw new Error("secret"); } }, "test:response")
    ("login-email", "private@example.test", secret, 10).catch((error) => error);
  const response = errorResponse(error);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "AUTH_UNAVAILABLE");
});

test("limiter refuses invalid configuration before making a Redis request", async () => {
  let calls = 0;
  const consume = createRateLimiter({ async eval() { calls++; return [1, 100]; } }, "test:config");
  for (const limit of [0, 1.5, 10001]) await assert.rejects(consume("login-email", "email", secret, limit));
  await assert.rejects(consume("login-email", "email", "short-secret", 10));
  assert.equal(calls, 0);
});

test("Redis env is server-only, validated lazily and partitions local/Preview/Production counters", () => {
  assert.throws(() => getRedisConfig({}), { code: "AUTH_UNAVAILABLE" });
  for (const url of ["http://test.upstash.io", "https://evil.example.test", "https://test.upstash.io/path", "https://test.upstash.io?token=secret"]) {
    assert.throws(() => getRedisConfig({ UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: "test-token" }), { code: "AUTH_UNAVAILABLE" });
  }
  const config = getRedisConfig({ UPSTASH_REDIS_REST_URL: "https://test.upstash.io", UPSTASH_REDIS_REST_TOKEN: "test-token" });
  assert.equal(config.url, "https://test.upstash.io");
  assert.equal(getRateLimitNamespace({ NODE_ENV: "development" }), "go-trail:auth:development");
  assert.equal(getRateLimitNamespace({ NODE_ENV: "production", VERCEL_ENV: "preview" }), "go-trail:auth:preview");
  assert.equal(getRateLimitNamespace({ NODE_ENV: "production" }), "go-trail:auth:production");
  assert.equal(getRateLimitNamespace({ AUTH_RATE_LIMIT_NAMESPACE: "test:unique" }), "test:unique");
  assert.equal(getRateLimitNamespace({ AUTH_RATE_LIMIT_NAMESPACE: "", NODE_ENV: "production" }), "go-trail:auth:production");
  assert.throws(() => getRateLimitNamespace({ AUTH_RATE_LIMIT_NAMESPACE: "bad namespace" }), { code: "AUTH_UNAVAILABLE" });
});
