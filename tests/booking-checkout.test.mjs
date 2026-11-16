import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePassengerDraft, buildHoldInput, holdAttempt } from "../src/lib/booking-checkout.ts";
import { createSeatHold, fetchBookingPickupPreferences, fetchDeparturePickups, BookingClientError } from "../src/lib/booking-client.ts";

const draft = { passenger_name: "  Khách kiểm thử  ", passenger_phone: "0900000000", emergency_contact: "Người thân 0900000001", health_declaration: true, pickup_key: "departure-41" };
const confirmed = [{ key: "departure-41", name: "Điểm đón", address: "Địa chỉ giả lập", pickup_time: "2026-11-04T01:00:00Z", dep_pickup_id: 41 }];

test("passenger form reuses shared field rules and requires a currently listed pickup", () => {
  assert.deepEqual(validatePassengerDraft(draft, confirmed), {});
  const errors = validatePassengerDraft({ ...draft, passenger_name: "<script>", passenger_phone: "abc", emergency_contact: "", health_declaration: false, pickup_key: "missing" }, confirmed);
  assert.deepEqual(Object.keys(errors).sort(), ["emergency_contact", "health_declaration", "passenger_name", "passenger_phone", "pickup_key"]);
});

test("catalog pickup preferences never become departure pickup IDs in a hold payload", () => {
  const options = [{ key: "catalog-41", name: "Điểm dự kiến", address: "Địa chỉ" }];
  assert.equal(buildHoldInput([{ seat_id: 7, draft: { ...draft, pickup_key: "catalog-41" } }], options, "test_key_12345678"), null);
  assert.equal(buildHoldInput([{ seat_id: 7, draft }], [], "test_key_12345678"), null);
});

test("hold payload uses confirmed departure IDs, normalized passenger fields and no client money or role", () => {
  assert.deepEqual(buildHoldInput([{ seat_id: 7, draft }], confirmed, "test_key_12345678"), {
    idempotency_key: "test_key_12345678", seats: [{ dep_seat_id: 7, dep_pickup_id: 41, passenger_name: "Khách kiểm thử", passenger_phone: "0900000000", emergency_contact: "Người thân 0900000001", health_declaration: true }],
  });
});

test("an unchanged retry keeps its original key and payload; a changed request gets a fresh key", () => {
  const input = buildHoldInput([{ seat_id: 7, draft }], confirmed, "test_key_12345678");
  const first = holdAttempt(null, input, () => "first_key_12345678");
  const retry = holdAttempt(first, input, () => { throw Error("retry must not generate another key"); });
  assert.deepEqual(retry, first);
  const changed = holdAttempt(first, { ...input, seats: [{ ...input.seats[0], passenger_name: "Khách khác" }] }, () => "second_key_12345678");
  assert.equal(changed.input.idempotency_key, "second_key_12345678");
});

test("existing hold endpoint receives the shared payload and preserves conflict/rate-limit responses", async () => {
  const original = globalThis.fetch;
  const input = buildHoldInput([{ seat_id: 7, draft }], confirmed, "test_key_12345678");
  const signal = new AbortController().signal;
  const dto = { invoice_id: 28, departure_id: 9, status: "Pending", total_amount: "550000", payment_code: "UITEST28", expires_at: "2026-11-04T01:00:00Z", responsible_name_snapshot: "Nhân viên giả lập", responsible_role_snapshot: "RouteMgr", tickets: [] };
  try {
    let status = 201;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/departures/9/holds");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.equal(options.signal, signal);
      assert.deepEqual(JSON.parse(options.body), input);
      return new Response(JSON.stringify(status === 201 ? { data: dto } : { error: { code: status === 409 ? "RESOURCE_CONFLICT" : "RATE_LIMITED", message: "Lỗi giả lập" } }), { status });
    };
    assert.deepEqual(await createSeatHold(9, input, signal), dto);
    for (status of [409, 429]) await assert.rejects(createSeatHold(9, input, signal), e => e instanceof BookingClientError && e.status === status);
  } finally { globalThis.fetch = original; }
});

test("the confirmed schedule comes from the departure endpoint and carries departure pickup IDs", async () => {
  const original = globalThis.fetch;
  const signal = new AbortController().signal;
  const dto = { departure_id: 9, pickups: [{ dep_pickup_id: 41, pickup_id: 3, name: "Điểm đón", address: "Địa chỉ giả lập", pickup_time: "2026-11-04T01:00:00Z" }] };
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/departures/9/pickups", "never the trip catalog endpoint");
      assert.equal(options.method ?? "GET", "GET");
      assert.equal(options.signal, signal);
      return new Response(JSON.stringify({ data: dto }));
    };
    const schedule = await fetchDeparturePickups(9, signal);
    assert.deepEqual(schedule, dto);
    const keyed = schedule.pickups.map(item => ({ ...item, key: `departure-${item.dep_pickup_id}` }));
    const input = buildHoldInput([{ seat_id: 7, draft }], keyed, "test_key_87654321");
    assert.equal(input.seats[0].dep_pickup_id, 41, "the schedule must unblock a real hold payload");
  } finally { globalThis.fetch = original; }
});

test("a failed schedule read leaves checkout unable to build a hold", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Lỗi giả lập" } }), { status: 404 });
    await assert.rejects(fetchDeparturePickups(9, new AbortController().signal),
      e => e instanceof BookingClientError && e.status === 404);
    assert.equal(buildHoldInput([{ seat_id: 7, draft }], [], "test_key_87654321"), null);
  } finally { globalThis.fetch = original; }
});

test("catalog pickup pagination is read through its existing public API", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/trips/5/pickups?page=2&pageSize=50");
      assert.equal(options.method ?? "GET", "GET");
      return new Response(JSON.stringify({ data: { items: [], pagination: { page: 2, pageSize: 50, totalItems: 51, totalPages: 2 } } }));
    };
    assert.equal((await fetchBookingPickupPreferences(5, 2, new AbortController().signal)).pagination.totalPages, 2);
  } finally { globalThis.fetch = original; }
});
