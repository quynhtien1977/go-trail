import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPickupSchedule } from "../src/lib/staff-ops-client.ts";

test("departure schedule retains selected pickup points from different pages", () => {
  assert.deepEqual(buildPickupSchedule({ 1: "2040-01-02T07:00", 51: "2040-01-02T06:30" }), [
    { pickup_id: 1, pickup_time: "2040-01-02T00:00:00.000Z" },
    { pickup_id: 51, pickup_time: "2040-01-01T23:30:00.000Z" },
  ]);
});

test("a selected pickup with no time blocks saving instead of being silently discarded", () => {
  assert.throws(() => buildPickupSchedule({ 1: "", 51: "2040-01-02T06:30" }), /giờ đón/i);
  assert.deepEqual(buildPickupSchedule({}), []);
});
