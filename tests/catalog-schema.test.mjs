import assert from "node:assert/strict";
import { test } from "node:test";
import { createTripSchema, updateTripSchema, createPickupSchema, updatePickupSchema,
  catalogQuerySchema, pageQuerySchema } from "../src/schemas/catalog.ts";

const trip = { name: "Núi Bà Đen", city: "Tây Ninh", location_name: "Núi Bà Đen",
  length_km: "8.50", base_price: "500000", description: "Tuyến trekking tham khảo.", schedule_content: "Đón khách → trekking → trở về." };

test("catalog keeps integer VND/decimal distance as strings and unknown trail values nullable", () => {
  const value = createTripSchema.parse({ ...trip, difficulty_level: null, peak_height_m: null });
  assert.equal(value.base_price, "500000");
  assert.equal(value.length_km, "8.50");
  assert.equal(value.difficulty_level, null);
  assert.equal(value.peak_height_m, null);
  for (const changes of [{ base_price: 500000 }, { base_price: "1.50" }, { base_price: "-1" },
    { base_price: "100000000000000" }, { length_km: "1.001" }, { length_km: "1000000" },
    { peak_height_m: -1 }, { peak_height_m: 2147483648 }]) assert.equal(createTripSchema.safeParse({ ...trip, ...changes }).success, false);
});

test("catalog refuses markup/control characters, ownership/source injection and empty patches", () => {
  for (const changes of [{ name: "<script>alert(1)</script>" }, { city: "Tây\u0000Ninh" },
    { source_url: "https://attacker.test/" }, { trip_id: 1 }, { pickups: [] }, { role: "Admin" }]) {
    assert.equal(createTripSchema.safeParse({ ...trip, ...changes }).success, false);
  }
  assert.equal(updateTripSchema.safeParse({}).success, false);
  assert.deepEqual(updateTripSchema.parse({ name: "  Tên mới  " }), { name: "Tên mới" });
  assert.deepEqual(updateTripSchema.parse({ district: null }), { district: null });
  assert.equal(createTripSchema.safeParse({ ...trip, description: "Lịch trình\nNgày 1\nNgày 2" }).success, true);
});

test("pickup input cannot move ownership or accept source-only fields", () => {
  assert.deepEqual(createPickupSchema.parse({ name: "  Điểm đón  ", address: "Địa chỉ tham khảo" }),
    { name: "Điểm đón", address: "Địa chỉ tham khảo" });
  assert.equal(createPickupSchema.safeParse({ name: "Điểm đón", address: "Địa chỉ", trip_id: 99 }).success, false);
  assert.deepEqual(updatePickupSchema.parse({ is_active: false }), { is_active: false });
  assert.equal(updatePickupSchema.safeParse({}).success, false);
  assert.equal(updatePickupSchema.safeParse({ address: "<img src=x>" }).success, false);
});

test("catalog queries bound pagination, reject unknown filters and do not coerce booleans/numbers", () => {
  assert.deepEqual(pageQuerySchema.parse({}), { page: 1, pageSize: 20 });
  assert.deepEqual(catalogQuerySchema.parse({ q: "  Bà Đen  ", city: "Tây Ninh", pageSize: "2" }),
    { page: 1, pageSize: 2, q: "Bà Đen", city: "Tây Ninh" });
  for (const query of [{ page: "0" }, { pageSize: "51" }, { page: "1e2" }, { page: "10001" },
    { page: 1 }, { include_demo: "true" }, { status: "Draft" }]) assert.equal(catalogQuerySchema.safeParse(query).success, false);
});
