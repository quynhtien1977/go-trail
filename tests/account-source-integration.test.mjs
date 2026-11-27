import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { AccountClientError, createAccountSource } from "../src/lib/customer-account-ui.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("account directory uses A01 pagination and maps the staff flag", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init.method });
    return Response.json({ data: {
      items: [{ user_id: 42, full_name: "Example Leader", email: "leader@example.test", phone: "0900000000",
        role: "Leader", status: "Active", created_at: "2026-11-01T00:00:00.000Z", is_staff: true }],
      pagination: { page: 2, pageSize: 10, totalItems: 12, totalPages: 2 },
    } });
  };
  const source = createAccountSource();
  const result = await source.list({ page: 2, pageSize: 10, q: "  leader  ", role: "Leader", status: "Active" });
  assert.deepEqual(calls, [{ url: "/api/admin/users?page=2&pageSize=10&q=leader&status=Active&role=Leader", method: "GET" }]);
  assert.equal(result.items[0].has_staff_profile, true);
  assert.equal(result.pagination.totalItems, 12);
  assert.equal(source.isDemo, false);
});

test("account changes reach A01 and failed requests never become demo success", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    return Response.json({ error: { code: "ACCESS_CONFLICT", message: "conflict" } }, { status: 409 });
  };
  const source = createAccountSource();
  await assert.rejects(source.updateAccess(42, { status: "Locked" }),
    (error) => error instanceof AccountClientError && error.status === 409 && error.code === "ACCESS_CONFLICT");
  assert.deepEqual(calls, [{ url: "/api/admin/users/42/access", method: "PATCH", body: { status: "Locked" } }]);
  globalThis.fetch = async () => Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  await assert.rejects(source.list({ page: 1, pageSize: 20 }),
    (error) => error instanceof AccountClientError && error.status === 403);
});

test("account directory rejects responses that omit the staff safety flag", async () => {
  globalThis.fetch = async () => Response.json({ data: { items: [{ user_id: 42 }],
    pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } } });
  await assert.rejects(createAccountSource().list({ page: 1, pageSize: 20 }),
    (error) => error instanceof AccountClientError && error.code === "INVALID_RESPONSE");
});
