import assert from "node:assert/strict";
import { test } from "node:test";
import { readQuery, readJson, json } from "../src/server/http.ts";
import { catalogQuerySchema } from "../src/schemas/catalog.ts";

test("catalog URL queries reject duplicate filters rather than silently selecting a value", () => {
  const query = readQuery(new Request("https://example.test/api/trips?q=B%C3%A0%20%C4%90en&pageSize=2"));
  assert.deepEqual(catalogQuerySchema.parse(query), { q: "Bà Đen", page: 1, pageSize: 2 });
  assert.throws(() => readQuery(new Request("https://example.test/api/trips?page=1&page=2")), { code: "INVALID_INPUT", status: 422 });
  assert.equal(catalogQuerySchema.safeParse(readQuery(new Request("https://example.test/api/trips?__proto__=bad"))).success, false);
});

test("catalog can read a bounded 64 KiB body while Auth retains its original 8 KiB limit", async () => {
  const body = JSON.stringify({ description: "x".repeat(9000) });
  const request = () => new Request("https://example.test/api/staff/trips", { method: "POST", headers: { "content-type": "application/json" }, body });
  await assert.rejects(readJson(request()), { code: "INVALID_INPUT", status: 413 });
  assert.equal((await readJson(request(), 65536)).description.length, 9000);
  await assert.rejects(readJson(new Request("https://example.test/api/staff/trips", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ description: "x".repeat(65536) }) }), 65536), { code: "INVALID_INPUT", status: 413 });
});

test("catalog follows the existing data envelope and no-store response contract", async () => {
  const response = json({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual((await response.json()).data.items, []);
});
