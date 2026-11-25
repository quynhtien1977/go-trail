import assert from "node:assert/strict";
import { test } from "node:test";
import { seatFloors, availableSelection, remainingInvoiceSeconds } from "../src/lib/booking-presentation.ts";

test("seat placement preserves coordinates, gaps, floor and every actual seat", () => {
  const seats = [
    { dep_seat_id: 7, seat_name: "D8", floor_level: 1, x_position: 4, y_position: 7, status: "Available" },
    { dep_seat_id: 2, seat_name: "A1", floor_level: 1, x_position: 0, y_position: 0, status: "Sold" },
    { dep_seat_id: 9, seat_name: "Upper", floor_level: 2, x_position: 1, y_position: 2, status: "Locked" },
  ];
  const floors = seatFloors(seats);
  assert.deepEqual(floors.map(f => [f.level, f.columns, f.rows]), [[1, 5, 8], [2, 2, 3]]);
  assert.deepEqual(floors[0].seats.map(s => [s.seat.dep_seat_id, s.column, s.row]), [[2, 1, 1], [7, 5, 8]]);
  assert.equal(floors[1].seats[0].seat.seat_name, "Upper");
  assert.deepEqual([floors[1].seats[0].column, floors[1].seats[0].row], [2, 3], "preserve leading empty positions on each floor");
  assert.deepEqual(seats.map(s => s.dep_seat_id), [7, 2, 9], "must not mutate the response");
});

test("full maps retain every supplied seat for 29 and 45 seat vehicles, without generating placeholders", () => {
  for (const [count, rows] of [[29, 8], [45, 11]]) {
    const seats = Array.from({ length: count }, (_, i) => ({
      dep_seat_id: i + 1, seat_name: `S${i + 1}`, floor_level: 1,
      x_position: i >= (rows - 1) * 4 ? i - (rows - 1) * 4 : [0, 1, 3, 4][i % 4],
      y_position: Math.min(Math.floor(i / 4), rows - 1), status: "Available",
    }));
    const result = seatFloors(seats);
    assert.equal(result[0].seats.length, count);
    assert.equal(result[0].rows, rows);
  }
  assert.deepEqual(seatFloors([]), []);
});

test("a refresh discards sold, locked, missing and duplicate selected IDs across vehicles", () => {
  const map = { departure_id: 1, vehicles: [
    { dep_vehicle_id: 1, vehicle_type: "29", seats: [{ dep_seat_id: 1, status: "Available" }, { dep_seat_id: 2, status: "Locked" }] },
    { dep_vehicle_id: 2, vehicle_type: "45", seats: [{ dep_seat_id: 3, status: "Sold" }, { dep_seat_id: 4, status: "Available" }] },
  ] };
  assert.deepEqual(availableSelection(map, [4, 2, 1, 3, 99, 1]), [4, 1]);
});

test("countdown uses server time plus elapsed time, rounds up and clamps at zero", () => {
  const invoice = { expires_at: "2026-11-03T10:15:00.000Z", server_time: "2026-11-03T10:00:00.000Z" };
  assert.equal(remainingInvoiceSeconds(invoice, 0), 900);
  assert.equal(remainingInvoiceSeconds(invoice, 1501), 899);
  assert.equal(remainingInvoiceSeconds(invoice, 900000), 0);
  assert.equal(remainingInvoiceSeconds(invoice, 990000), 0);
  assert.equal(remainingInvoiceSeconds({ ...invoice, expires_at: "bad" }, 0), 0);
});
