import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCronSecret } from "../src/server/auth/cron.ts";

const secret = "fixture-cron-secret-0123456789abcdef";

test("Q03 accepts only the configured Bearer secret", () => {
  const env = { CRON_SECRET: secret };
  assert.doesNotThrow(() => assertCronSecret(`Bearer ${secret}`, env));
  for (const header of [null, "", secret, `Apikey ${secret}`, `Bearer ${secret}x`, `Bearer ${secret.slice(1)}`, "Bearer ", "Bearer wrong"]) {
    assert.throws(() => assertCronSecret(header, env), { code: "UNAUTHENTICATED", status: 401 });
  }
});

test("Q03 fails closed when its server secret is missing, weak or malformed", () => {
  for (const value of [undefined, "", "too-short", "x".repeat(31) + " ", "x".repeat(257)]) {
    assert.throws(() => assertCronSecret(`Bearer ${secret}`, { CRON_SECRET: value }), { code: "CRON_UNAVAILABLE", status: 503 });
  }
});
