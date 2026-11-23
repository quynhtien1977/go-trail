import assert from "node:assert/strict";
import { describe, before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import {
  createSupplyItem,
  updateSupplyItem,
  readSupplyItem,
  listSupplyItems,
  receiveSupply,
} from "../src/server/services/inventory.ts";

let database, db, hrUser, adminUser, routeMgrUser, customerUser;
const testKey = (n) => `supply-key-service-${String(n).padStart(4, "0")}`;

before(async () => {
  database = await createTestDatabase();
  db = database.client;
});
after(async () => {
  await database?.close();
});

// I02 (SCRUM-68). Hooks live inside describe because `npm test` runs with --test-isolation=none,
// where a top-level beforeEach would rebuild this fixture before every test of every file.
describe("I02 supply catalog and stock receipt (SCRUM-68)", () => {
  beforeEach(async () => {
    await database.sql.exec("TRUNCATE users, supply_items, supply_transactions, audit_logs RESTART IDENTITY CASCADE");

    const hr = await db.user.create({
      data: { email: "hr@inventory.test", password_hash: "hash", full_name: "HR Manager", phone: "0901111111", role: "HRMgr" },
    });
    hrUser = { user_id: hr.user_id, role: "HRMgr", auth_version: 0 };

    const admin = await db.user.create({
      data: { email: "admin@inventory.test", password_hash: "hash", full_name: "Admin User", phone: "0902222222", role: "Admin" },
    });
    adminUser = { user_id: admin.user_id, role: "Admin", auth_version: 0 };

    const routeMgr = await db.user.create({
      data: { email: "route@inventory.test", password_hash: "hash", full_name: "Route Manager", phone: "0903333333", role: "RouteMgr" },
    });
    routeMgrUser = { user_id: routeMgr.user_id, role: "RouteMgr", auth_version: 0 };

    const customer = await db.user.create({
      data: { email: "customer@inventory.test", password_hash: "hash", full_name: "Customer", phone: "0904444444", role: "Customer" },
    });
    customerUser = { user_id: customer.user_id, role: "Customer", auth_version: 0 };
  });

  test("HRMgr and Admin can create supply items with valid category and explicit counted unit", async () => {
    const item1 = await createSupplyItem(db, hrUser, {
      name: "Nước khoáng Lavie",
      category: "Drink",
      unit: "chai 500ml",
    });
    assert.equal(item1.name, "Nước khoáng Lavie");
    assert.equal(item1.category, "Drink");
    assert.equal(item1.unit, "chai 500ml");
    assert.equal(item1.is_active, true);
    assert.equal(item1.on_hand, 0);

    const item2 = await createSupplyItem(db, adminUser, {
      name: "Gậy trekking",
      category: "Gear",
      unit: "cây",
    });
    assert.equal(item2.name, "Gậy trekking");
    assert.equal(item2.category, "Gear");

    const audit = await db.auditLog.findFirst({ where: { action: "SupplyItemCreated" } });
    assert.ok(audit);
    assert.equal(audit?.user_id, hrUser.user_id);
  });

  test("Duplicate item name is rejected with 409 RESOURCE_CONFLICT", async () => {
    await createSupplyItem(db, hrUser, { name: "Bánh quy năng lượng", category: "Food", unit: "gói 100g" });
    await assert.rejects(
      createSupplyItem(db, hrUser, { name: "Bánh quy năng lượng", category: "Food", unit: "hộp 500g" }),
      { code: "RESOURCE_CONFLICT" }
    );
  });

  test("Invalid inputs are rejected with 422 INVALID_INPUT", async () => {
    await assert.rejects(createSupplyItem(db, hrUser, { name: "   ", category: "Food", unit: "gói" }), { code: "INVALID_INPUT" });
    await assert.rejects(createSupplyItem(db, hrUser, { name: "Mì ly", category: "Food", unit: "   " }), { code: "INVALID_INPUT" });
    await assert.rejects(createSupplyItem(db, hrUser, { name: "Nước ngọt", category: "Beverage", unit: "lon" }), { code: "INVALID_INPUT" });
  });

  test("HRMgr and Admin can update supply items and retire them via is_active false", async () => {
    const item = await createSupplyItem(db, hrUser, { name: "Áo mưa tiện lợi", category: "Gear", unit: "cái" });

    const updated = await updateSupplyItem(db, hrUser, item.item_id, {
      name: "Áo mưa cánh dơi",
      unit: "bộ",
      is_active: false,
    });
    assert.equal(updated.name, "Áo mưa cánh dơi");
    assert.equal(updated.unit, "bộ");
    assert.equal(updated.is_active, false);

    const fromDb = await db.supplyItem.findUnique({ where: { item_id: item.item_id } });
    assert.equal(fromDb?.is_active, false);

    const audit = await db.auditLog.findFirst({ where: { action: "SupplyItemUpdated" } });
    assert.ok(audit);
  });

  test("Renaming to an existing name is rejected with 409 RESOURCE_CONFLICT", async () => {
    await createSupplyItem(db, hrUser, { name: "Vật tư 1", category: "Gear", unit: "cái" });
    const item2 = await createSupplyItem(db, hrUser, { name: "Vật tư 2", category: "Gear", unit: "cái" });

    await assert.rejects(
      updateSupplyItem(db, hrUser, item2.item_id, { name: "Vật tư 1" }),
      { code: "RESOURCE_CONFLICT" }
    );
  });

  test("HRMgr and Admin list supply items with pagination and category filter", async () => {
    await createSupplyItem(db, hrUser, { name: "Lương khô", category: "Food", unit: "gói" });
    await createSupplyItem(db, hrUser, { name: "Nước tăng lực", category: "Drink", unit: "lon" });
    await createSupplyItem(db, hrUser, { name: "Đèn pin", category: "Gear", unit: "chiếc" });

    const pageForRoute = await listSupplyItems(db, hrUser, { page: 1, pageSize: 2 });
    assert.equal(pageForRoute.items.length, 2);
    assert.equal(pageForRoute.pagination.totalItems, 3);
    assert.equal(pageForRoute.pagination.totalPages, 2);

    const foodOnly = await listSupplyItems(db, adminUser, { category: "Food" });
    assert.equal(foodOnly.items.length, 1);
    assert.equal(foodOnly.items[0].name, "Lương khô");
  });

  test("HRMgr and Admin can receive stock (nhập kho) into append-only ledger", async () => {
    const item = await createSupplyItem(db, hrUser, { name: "Xịt chống côn trùng", category: "Gear", unit: "chai 100ml" });

    const txn = await receiveSupply(db, hrUser, {
      item_id: item.item_id,
      quantity: 50,
      idempotency_key: testKey(1),
      note: "Nhập đợt đầu tháng",
    });
    assert.equal(txn.item_id, item.item_id);
    assert.equal(txn.txn_type, "Receive");
    assert.equal(txn.quantity, 50);
    assert.equal(txn.departure_id, null);
    assert.equal(txn.note, "Nhập đợt đầu tháng");

    const refreshed = await readSupplyItem(db, hrUser, item.item_id);
    assert.equal(refreshed.on_hand, 50);

    const audit = await db.auditLog.findFirst({ where: { action: "SupplyReceived" } });
    assert.ok(audit);
    assert.equal(audit?.user_id, hrUser.user_id);
  });

  test("receiveSupply is idempotent: duplicate key with same payload returns existing txn, different payload rejects with 409", async () => {
    const item = await createSupplyItem(db, hrUser, { name: "Bông băng", category: "Gear", unit: "cuộn" });

    const first = await receiveSupply(db, hrUser, {
      item_id: item.item_id,
      quantity: 20,
      idempotency_key: testKey(2),
      note: "Đợt 1",
    });

    const retry = await receiveSupply(db, hrUser, {
      item_id: item.item_id,
      quantity: 20,
      idempotency_key: testKey(2),
      note: "Đợt 1",
    });
    assert.equal(retry.txn_id, first.txn_id);

    // Still on_hand = 20 (not double counted)
    const itemRead = await readSupplyItem(db, hrUser, item.item_id);
    assert.equal(itemRead.on_hand, 20);

    // Different payload with same key must reject with 409
    await assert.rejects(
      receiveSupply(db, hrUser, {
        item_id: item.item_id,
        quantity: 30, // changed quantity
        idempotency_key: testKey(2),
      }),
      { code: "RESOURCE_CONFLICT" }
    );
  });

  test("receiveSupply rejects for inactive (retired) items with 409 RESOURCE_CONFLICT", async () => {
    const item = await createSupplyItem(db, hrUser, { name: "Vật tư cũ", category: "Gear", unit: "cái" });
    await updateSupplyItem(db, hrUser, item.item_id, { is_active: false });

    await assert.rejects(
      receiveSupply(db, hrUser, {
        item_id: item.item_id,
        quantity: 10,
        idempotency_key: testKey(3),
      }),
      { code: "RESOURCE_CONFLICT" }
    );
  });

  test("RBAC: RouteMgr and Customer cannot read the catalog, create, update or receive supply items", async () => {
    await assert.rejects(
      createSupplyItem(db, routeMgrUser, { name: "A", category: "Gear", unit: "bộ" }),
      { code: "FORBIDDEN" }
    );
    await assert.rejects(
      createSupplyItem(db, customerUser, { name: "A", category: "Gear", unit: "bộ" }),
      { code: "FORBIDDEN" }
    );

    const item = await createSupplyItem(db, hrUser, { name: "Mũ tai bèo", category: "Gear", unit: "cái" });
    await assert.rejects(
      updateSupplyItem(db, routeMgrUser, item.item_id, { name: "Mũ rộng vành" }),
      { code: "FORBIDDEN" }
    );
    await assert.rejects(
      receiveSupply(db, routeMgrUser, { item_id: item.item_id, quantity: 5, idempotency_key: testKey(4) }),
      { code: "FORBIDDEN" }
    );

    await assert.rejects(listSupplyItems(db, customerUser), { code: "FORBIDDEN" });
    await assert.rejects(readSupplyItem(db, customerUser, item.item_id), { code: "FORBIDDEN" });
    // PRD 3.2/7.12: RouteMgr reads only supplies issued to its own departures (I03), never the whole catalog or stock.
    await assert.rejects(listSupplyItems(db, routeMgrUser), { code: "FORBIDDEN" });
    await assert.rejects(readSupplyItem(db, routeMgrUser, item.item_id), { code: "FORBIDDEN" });
  });
});
