import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { readSupplies, moveSupply } from "../src/server/services/departure-supplies.ts";
import { readSupplyItem, receiveSupply, updateSupplyItem } from "../src/server/services/inventory.ts";

describe("I03 departure supplies authorization and lifecycle (SCRUM-69)", () => {
  let database, db, actors, staff, departure, item;

  before(async () => {
    database = await createTestDatabase();
    db = database.client;
  });

  after(async () => { await database?.close(); });

  beforeEach(async () => {
    await database.sql.exec("TRUNCATE users, trips, vehicles, staff, supply_items, supply_transactions, audit_logs RESTART IDENTITY CASCADE");
    actors = {};
    for (const role of ["HRMgr", "Admin", "RouteMgr", "Leader", "Customer"]) {
      const user = await db.user.create({ data: { email: `${role}@i03-review.example.test`, password_hash: "fixture-hash",
        full_name: role, phone: "0901234567", role } });
      actors[role] = { user_id: user.user_id, role, auth_version: 0 };
    }
    const otherManager = await db.user.create({ data: { email: "other-manager@i03-review.example.test", password_hash: "fixture-hash",
      full_name: "Other manager", phone: "0901234567", role: "RouteMgr" } });
    actors.otherManager = { user_id: otherManager.user_id, role: "RouteMgr", auth_version: 0 };
    staff = await db.staff.create({ data: { user_id: actors.Leader.user_id, full_name: "Assigned Leader",
      phone: "0901234567", staff_type: "Leader" } });
    const trip = await db.trip.create({ data: { name: "I03 fixture", city: "Test", location_name: "Test", length_km: "1",
      base_price: "1000", description: "fixture", schedule_content: "fixture" } });
    departure = await db.departure.create({ data: { trip_id: trip.trip_id, status: "Draft", min_passengers: 1,
      departure_date: new Date("2035-01-02T00:00:00Z"), booking_deadline: new Date("2035-01-01T00:00:00Z"),
      invoice_owner_user_id: actors.RouteMgr.user_id } });
    const vehicle = await db.vehicle.create({ data: { plate_number: "I03-FIXTURE", vehicle_type: "test", seat_count: 1 } });
    const depVehicle = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
    await db.departureStaff.create({ data: { departure_id: departure.departure_id, dep_vehicle_id: depVehicle.dep_vehicle_id,
      staff_id: staff.staff_id, role_in_trip: "Leader" } });
    item = await db.supplyItem.create({ data: { name: "I03 fixture item", category: "Drink", unit: "bottle" } });
    await receiveSupply(db, actors.HRMgr, { item_id: item.item_id, quantity: 10, idempotency_key: "i03-review-receive" });
  });

  const setStatus = (status) => db.departure.update({ where: { departure_id: departure.departure_id }, data: { status } });
  const payload = (key, quantity = 1, recipient = staff.staff_id) => ({ item_id: item.item_id, quantity,
    recipient_staff_id: recipient, idempotency_key: key, note: "Supply handoff" });
  const move = (type, key, quantity = 1, recipient = staff.staff_id, actor = actors.HRMgr) =>
    moveSupply(db, actor, departure.departure_id, type, payload(key, quantity, recipient));

  for (const status of ["Draft", "Open", "Closed", "Cancelled", "Rescheduled"]) {
    test(`Leader cannot read supplies on an assigned ${status} departure`, async () => {
      await setStatus(status);
      await assert.rejects(readSupplies(db, actors.Leader, departure.departure_id), { code: "NOT_FOUND" });
    });
  }

  test("active assigned Leader can read Confirmed/Running/Ended, but inactive Leader cannot", async () => {
    for (const status of ["Confirmed", "Running", "Ended"]) {
      await setStatus(status);
      assert.deepEqual(await readSupplies(db, actors.Leader, departure.departure_id), { items: [] });
    }
    await db.staff.update({ where: { staff_id: staff.staff_id }, data: { status: "Inactive" } });
    await assert.rejects(readSupplies(db, actors.Leader, departure.departure_id), { code: "NOT_FOUND" });
  });

  test("departure reads remain scoped for RouteMgr and assigned Leader while HRMgr/Admin can read", async () => {
    await setStatus("Confirmed");
    for (const actor of [actors.RouteMgr, actors.HRMgr, actors.Admin, actors.Leader]) {
      assert.deepEqual(await readSupplies(db, actor, departure.departure_id), { items: [] });
    }
    await assert.rejects(readSupplies(db, actors.otherManager, departure.departure_id), { code: "NOT_FOUND" });
    await assert.rejects(readSupplies(db, actors.Customer, departure.departure_id), { code: "FORBIDDEN" });
    await db.departureStaff.updateMany({ where: { departure_id: departure.departure_id, staff_id: staff.staff_id },
      data: { role_in_trip: "Assistant" } });
    await assert.rejects(readSupplies(db, actors.Leader, departure.departure_id), { code: "NOT_FOUND" });
  });

  test("active assigned staff can receive supplies before a departure ends", async () => {
    for (const status of ["Draft", "Open", "Closed", "Confirmed", "Running"]) {
      await setStatus(status);
      const result = await move("Issue", `i03-issue-${status.toLowerCase()}-key`);
      assert.equal(result.txn_type, "Issue");
      assert.equal(result.recipient_staff_id, staff.staff_id);
    }
    assert.equal((await readSupplyItem(db, actors.HRMgr, item.item_id)).on_hand, 5);
    assert.equal((await readSupplies(db, actors.HRMgr, departure.departure_id)).items[0].remaining, 5);
  });

  for (const status of ["Ended", "Cancelled", "Rescheduled"]) {
    test(`new issue is rejected for ${status} without changing stock or ledger`, async () => {
      await setStatus(status);
      const before = await db.supplyTransaction.count();
      await assert.rejects(move("Issue", `i03-terminal-${status.toLowerCase()}-key`), { code: "RESOURCE_CONFLICT" });
      assert.equal(await db.supplyTransaction.count(), before);
      assert.equal((await readSupplyItem(db, actors.HRMgr, item.item_id)).on_hand, 10);
    });
  }

  test("legacy terminal departures can return previously issued stock", async () => {
    for (const status of ["Cancelled", "Rescheduled"]) {
      await setStatus("Draft");
      await move("Issue", `i03-before-${status.toLowerCase()}-issue`);
      await setStatus(status);
      const returned = await move("Return", `i03-after-${status.toLowerCase()}-return`);
      assert.equal(returned.txn_type, "Return");
    }
    assert.equal((await readSupplyItem(db, actors.HRMgr, item.item_id)).on_hand, 10);
  });

  test("return after Ended works for inactive assigned recipient and retired item, without excess or duplicate returns", async () => {
    const issued = await move("Issue", "i03-prior-issue-key", 4);
    await setStatus("Ended");
    await db.staff.update({ where: { staff_id: staff.staff_id }, data: { status: "Inactive" } });
    await updateSupplyItem(db, actors.HRMgr, item.item_id, { is_active: false });

    const issueRetry = await move("Issue", "i03-prior-issue-key", 4);
    assert.equal(issueRetry.txn_id, issued.txn_id);
    const returned = await move("Return", "i03-first-return-key", 2);
    assert.equal(returned.recipient_staff_id, staff.staff_id);
    assert.equal((await move("Return", "i03-first-return-key", 2)).txn_id, returned.txn_id);
    await assert.rejects(move("Return", "i03-first-return-key", 1), { code: "RESOURCE_CONFLICT" });
    await assert.rejects(move("Return", "i03-over-return-key", 3), { code: "RESOURCE_CONFLICT" });
    assert.equal((await readSupplyItem(db, actors.HRMgr, item.item_id)).on_hand, 8);
    assert.equal((await readSupplies(db, actors.HRMgr, departure.departure_id)).items[0].remaining, 2);
    assert.equal(await db.supplyTransaction.count(), 3);
  });

  test("former recipient can return their item after reassignment, but not another item with no issue to them", async () => {
    await move("Issue", "i03-former-recipient-issue", 2);
    const another = await db.staff.create({ data: { full_name: "Other crew", phone: "0901234567", staff_type: "Assistant" } });
    const vehicle = await db.departureVehicle.findFirstOrThrow({ where: { departure_id: departure.departure_id } });
    await db.departureStaff.create({ data: { departure_id: departure.departure_id, dep_vehicle_id: vehicle.dep_vehicle_id,
      staff_id: another.staff_id, role_in_trip: "Assistant" } });
    const otherItem = await db.supplyItem.create({ data: { name: "Other item", category: "Gear", unit: "piece" } });
    await receiveSupply(db, actors.HRMgr, { item_id: otherItem.item_id, quantity: 2, idempotency_key: "i03-other-item-receipt" });
    await moveSupply(db, actors.HRMgr, departure.departure_id, "Issue", { ...payload("i03-other-item-issue", 1, another.staff_id), item_id: otherItem.item_id });
    await db.departureStaff.deleteMany({ where: { departure_id: departure.departure_id, staff_id: staff.staff_id } });
    await setStatus("Ended");
    await db.staff.update({ where: { staff_id: staff.staff_id }, data: { status: "Inactive" } });

    const returned = await move("Return", "i03-former-recipient-return", 1);
    assert.equal(returned.recipient_staff_id, staff.staff_id);
    await assert.rejects(moveSupply(db, actors.HRMgr, departure.departure_id, "Return",
      { ...payload("i03-unrelated-item-return"), item_id: otherItem.item_id }), { code: "NOT_FOUND" });
    assert.equal((await readSupplyItem(db, actors.HRMgr, item.item_id)).on_hand, 9);
  });

  test("inactive or unassigned recipients cannot receive a new issue, and another trip's staff cannot return it", async () => {
    const outsider = await db.staff.create({ data: { full_name: "Unassigned staff", phone: "0901234567", staff_type: "Assistant" } });
    await assert.rejects(move("Issue", "i03-wrong-issue-recipient", 1, outsider.staff_id), { code: "NOT_FOUND" });
    await move("Issue", "i03-valid-issue-recipient", 2);
    await setStatus("Ended");
    await assert.rejects(move("Return", "i03-wrong-return-recipient", 1, outsider.staff_id), { code: "NOT_FOUND" });
    await setStatus("Draft");
    await db.staff.update({ where: { staff_id: staff.staff_id }, data: { status: "Inactive" } });
    await assert.rejects(move("Issue", "i03-inactive-issue-recipient"), { code: "NOT_FOUND" });
    assert.equal((await readSupplyItem(db, actors.HRMgr, item.item_id)).on_hand, 8);
  });
});
