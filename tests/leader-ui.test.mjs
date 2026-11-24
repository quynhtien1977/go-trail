import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  LeaderClientError, ScanDebouncer, applyPassengerUpdate, countByTab, defaultTripTab, departuresForTab,
  describeCheckInResult, describeLeaderError, filterPassengers, formatClock, formatDepartureDate, formatPhone,
  groupByPickup, isRetryable, leaderClient, matchesPassenger, normalizeTicketCode, summarize, telHref, tripTabOf,
} from "../src/lib/leader-ui.ts";

const passenger = (detail_id, overrides = {}) => ({
  detail_id,
  seat_name: `A${detail_id}`,
  passenger_name: "Nguyễn Văn An",
  passenger_phone: "0912345678",
  emergency_contact: "Mẹ 0903111222",
  pickup: { dep_pickup_id: 1, name: "Ngã tư Hàng Xanh", address: "Bình Thạnh", pickup_time: "2026-11-28T22:30:00.000Z" },
  vehicle: { dep_vehicle_id: 7, plate_number: "51B-123.45" },
  check_in_status: "Pending",
  check_in_time: null,
  ...overrides,
});

const manifest = (passengers) => ({
  departure: { departure_id: 128, trip_name: "Tà Năng", departure_date: "2026-11-28T23:00:00.000Z", status: "Running", check_in_open: true },
  summary: summarize(passengers),
  crew: [],
  passengers,
  server_time: "2026-11-28T22:00:00.000Z",
});

test("trip tabs only know the Leader-visible statuses and open on the most relevant tab", () => {
  assert.equal(tripTabOf("Confirmed"), "upcoming");
  assert.equal(tripTabOf("Running"), "running");
  assert.equal(tripTabOf("Ended"), "ended");
  for (const status of ["Open", "Closed", "Cancelled", "Draft", ""]) assert.equal(tripTabOf(status), null);

  assert.equal(defaultTripTab([{ status: "Confirmed" }, { status: "Running" }]), "running");
  assert.equal(defaultTripTab([{ status: "Ended" }, { status: "Confirmed" }]), "upcoming");
  assert.equal(defaultTripTab([{ status: "Ended" }]), "ended");
  assert.equal(defaultTripTab([]), "upcoming");

  const list = [
    { status: "Ended", departure_date: "2026-10-01T00:00:00.000Z" },
    { status: "Ended", departure_date: "2026-11-01T00:00:00.000Z" },
    { status: "Confirmed", departure_date: "2026-12-01T00:00:00.000Z" },
    { status: "Open", departure_date: "2026-12-02T00:00:00.000Z" },
  ];
  assert.deepEqual(countByTab(list), { upcoming: 1, running: 0, ended: 2 });
  assert.deepEqual(departuresForTab(list, "ended").map((item) => item.departure_date),
    ["2026-11-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"]);
});

test("passenger search folds Vietnamese accents and matches phone digits, seat and plate", () => {
  const item = passenger(3, { passenger_name: "Trần Thị Đào" });
  assert.equal(matchesPassenger(item, ""), true);
  assert.equal(matchesPassenger(item, "dao"), true);
  assert.equal(matchesPassenger(item, "TRAN dao"), true);
  assert.equal(matchesPassenger(item, "0912 345"), true);
  assert.equal(matchesPassenger(item, "a3"), true);
  assert.equal(matchesPassenger(item, "51b-123"), true);
  assert.equal(matchesPassenger(item, "minh"), false);
  assert.equal(matchesPassenger(item, "99"), false, "two digits are too short to be a phone search");
});

test("filters and pickup groups keep the server order (pickup time, then seat)", () => {
  const rows = [
    passenger(1, { check_in_status: "CheckedIn", check_in_time: "2026-11-28T22:25:00.000Z" }),
    passenger(2),
    passenger(3, { pickup: { dep_pickup_id: 2, name: "Comeco", address: "Q1", pickup_time: "2026-11-28T22:45:00.000Z" }, check_in_status: "Absent" }),
    passenger(4),
  ];
  assert.deepEqual(filterPassengers(rows, "Pending", "").map((row) => row.detail_id), [2, 4]);
  assert.deepEqual(filterPassengers(rows, "all", "").map((row) => row.detail_id), [1, 2, 3, 4]);
  const groups = groupByPickup(rows);
  assert.deepEqual(groups.map((group) => [group.key, group.passengers.map((row) => row.detail_id)]), [[1, [1, 2, 4]], [2, [3]]]);
  assert.deepEqual(summarize(rows), { total: 4, checked_in: 1, absent: 1, pending: 2 });
});

test("applyPassengerUpdate replaces the row and recomputes the summary; unknown rows change nothing", () => {
  const before = manifest([passenger(1), passenger(2)]);
  const after = applyPassengerUpdate(before, passenger(2, { check_in_status: "CheckedIn", check_in_time: "2026-11-28T22:40:00.000Z" }));
  assert.equal(after.passengers[1].check_in_status, "CheckedIn");
  assert.deepEqual(after.summary, { total: 2, checked_in: 1, absent: 0, pending: 1 });
  assert.equal(before.passengers[1].check_in_status, "Pending", "input is not mutated");
  assert.equal(applyPassengerUpdate(before, passenger(99)), before);
});

test("normalizeTicketCode mirrors the server schema", () => {
  assert.equal(normalizeTicketCode("  tk3f9a0b  "), "TK3F9A0B");
  assert.equal(normalizeTicketCode("TK_ab-12"), "TK_AB-12");
  assert.equal(normalizeTicketCode(""), null);
  assert.equal(normalizeTicketCode("   "), null);
  assert.equal(normalizeTicketCode("https://evil.example/TK1"), null);
  assert.equal(normalizeTicketCode("TK 123"), null);
  assert.equal(normalizeTicketCode("A".repeat(64)), "A".repeat(64));
  assert.equal(normalizeTicketCode("A".repeat(65)), null);
});

test("ScanDebouncer fires once while a QR stays in view and again after it left the frame", () => {
  const debouncer = new ScanDebouncer(3000);
  assert.equal(debouncer.accept("TK1", 0), true);
  assert.equal(debouncer.accept("TK1", 1000), false);
  assert.equal(debouncer.accept("TK1", 3500), false, "continuous sightings keep extending the window");
  assert.equal(debouncer.accept("TK2", 3600), true, "a different ticket is accepted immediately");
  assert.equal(debouncer.accept("TK1", 3700), true);
  assert.equal(debouncer.accept("TK1", 7000), true, "seen again after more than the window");
  debouncer.reset();
  assert.equal(debouncer.accept("TK1", 7001), true);
});

test("check-in results and every L01/L02 error code map to user wording without technical terms", () => {
  const row = passenger(1, { check_in_status: "CheckedIn", check_in_time: "2026-11-28T22:25:00.000Z" });
  assert.equal(describeCheckInResult({ result: "CheckedIn", changed: true, passenger: row }).tone, "success");
  const again = describeCheckInResult({ result: "AlreadyCheckedIn", changed: false, passenger: row });
  assert.equal(again.tone, "warning");
  assert.match(again.detail, /05:25/);
  assert.equal(describeCheckInResult({ result: "MarkedAbsent", changed: true, passenger: row }).tone, "neutral");

  const codes = ["TICKET_NOT_FOUND", "TICKET_WRONG_DEPARTURE", "TICKET_NOT_VALID", "CHECKIN_CLOSED", "ALREADY_CHECKED_IN",
    "INVALID_QR", "INVALID_INPUT", "RATE_LIMITED", "UNAUTHENTICATED", "NOT_FOUND", "FORBIDDEN", "RESOURCE_CONFLICT", "NETWORK_ERROR", "SOMETHING_NEW"];
  for (const code of codes) {
    const outcome = describeLeaderError(code, 409);
    assert.ok(outcome.title.length > 0, code);
    assert.doesNotMatch(`${outcome.title} ${outcome.detail ?? ""}`, /API|Endpoint|Payload|Null|Database|RBAC|PRD|hoàn tiền|đánh giá/i, code);
  }
  assert.equal(describeLeaderError("TICKET_WRONG_DEPARTURE", 409).title, "Vé thuộc chuyến khác");
  assert.equal(isRetryable("NETWORK_ERROR", 0), true);
  assert.equal(isRetryable("RATE_LIMITED", 429), true);
  assert.equal(isRetryable("REQUEST_FAILED", 503), true);
  assert.equal(isRetryable("TICKET_NOT_FOUND", 404), false);
});

test("times are shown in Vietnam time and phones are dialable", () => {
  assert.equal(formatClock("2026-11-28T22:25:00.000Z"), "05:25");
  assert.equal(formatDepartureDate("2026-11-28T23:00:00.000Z"), "06:00, 29/11/2026");
  assert.equal(formatPhone("0912345678"), "0912 345 678");
  assert.equal(formatPhone("+84 912"), "+84 912");
  assert.equal(telHref("0912 345 678"), "tel:0912345678");
});

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test("leaderClient sends the L01/L02 contract bodies and surfaces structured errors", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    if (url === "/api/checkin" && calls.length === 2) {
      return new Response(JSON.stringify({ error: { code: "TICKET_WRONG_DEPARTURE", message: "x" } }), { status: 409 });
    }
    return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
  };
  await leaderClient.readManifest(128);
  await assert.rejects(leaderClient.checkIn(128, "TK1"), (error) => error instanceof LeaderClientError
    && error.status === 409 && error.code === "TICKET_WRONG_DEPARTURE");
  await leaderClient.markAbsent(128, 5);
  await leaderClient.endDeparture(128);
  assert.deepEqual(calls, [
    { url: "/api/leader/departures/128/manifest", method: "GET", body: undefined },
    { url: "/api/checkin", method: "POST", body: { action: "CheckIn", departure_id: 128, ticket_code: "TK1" } },
    { url: "/api/checkin", method: "POST", body: { action: "MarkAbsent", departure_id: 128, detail_id: 5 } },
    { url: "/api/leader/departures/128/end", method: "POST", body: {} },
  ]);

  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(leaderClient.readManifest(1), (error) => error instanceof LeaderClientError && error.code === "NETWORK_ERROR");
  globalThis.fetch = async () => new Response("<html>", { status: 502 });
  await assert.rejects(leaderClient.readManifest(1), (error) => error.code === "REQUEST_FAILED" && error.status === 502);
});
