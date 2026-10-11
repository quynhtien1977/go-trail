import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSameOrigin, readJson, parseId, errorResponse } from "../src/server/http.ts";
import { AppError } from "../src/server/errors.ts";
import { getTrustedClientIp } from "../src/server/auth/client-source.ts";

test("cookie-authenticated writes reject foreign or missing Origin", () => {
  const previous = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = "https://go-trail.example.test";
  try {
    for (const origin of [undefined, "https://evil.example.test", "null"]) {
      const headers = origin ? { origin } : {};
      assert.throws(() => assertSameOrigin(new Request("https://go-trail.example.test/api", { headers })), { code: "FORBIDDEN" });
    }
    assert.doesNotThrow(() => assertSameOrigin(new Request("https://go-trail.example.test/api", { headers: { origin: "https://go-trail.example.test" } })));
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = previous;
  }
});

test("client headers are ignored outside Vercel and the Vercel source must be a valid platform IP", () => {
  const previous = process.env.VERCEL;
  try {
    delete process.env.VERCEL;
    assert.equal(getTrustedClientIp(new Headers({ "x-vercel-forwarded-for": "192.0.2.1" })), undefined);
    process.env.VERCEL = "1";
    assert.equal(getTrustedClientIp(new Headers({ "x-vercel-forwarded-for": "192.0.2.1" })), "192.0.2.1");
    assert.throws(() => getTrustedClientIp(new Headers({ "x-forwarded-for": "192.0.2.1" })), /Trusted client source unavailable/);
    assert.throws(() => getTrustedClientIp(new Headers({ "x-vercel-forwarded-for": "192.0.2.1, 192.0.2.2" })), /Trusted client source unavailable/);
  } finally {
    if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous;
  }
});

test("HTTP boundary caps actual streamed bytes and rejects malformed JSON/content types", async () => {
  await assert.rejects(readJson(new Request("http://localhost/api", { method: "POST", body: "{}" })), { status: 415 });
  await assert.rejects(readJson(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })), { status: 422 });
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(4096)); controller.enqueue(new Uint8Array(4097)); controller.close();
  } });
  await assert.rejects(readJson(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" })), { status: 413 });
});

test("IDs must be valid PostgreSQL integer IDs; public errors cannot leak internals", async () => {
  for (const id of ["0", "-1", "1e2", "01", "2147483648", "1 OR TRUE"]) {
    assert.throws(() => parseId(id), { code: "INVALID_INPUT" });
  }
  assert.equal(parseId("2147483647"), 2147483647);
  const response = errorResponse(new AppError("UNAUTHENTICATED", 401));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
});
