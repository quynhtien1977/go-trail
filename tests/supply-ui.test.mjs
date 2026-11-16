import assert from "node:assert/strict";
import { test } from "node:test";
import { BookingClientError } from "../src/lib/booking-client.ts";
import {
  classifySupplyMutationError,
  remainingAllocatableReturn,
  stockHealthStatus,
  supplyReadScope,
  supplyRoleCapabilities,
  validateCatalogItemDraft,
  validateDepartureIssueDraft,
  validateDepartureReturnDraft,
  validateStockInDraft,
} from "../src/lib/supply-ui.ts";

test("supplyRoleCapabilities enforces PRD 3.2 matrix for HRMgr, Admin, RouteMgr, Leader and Customer", () => {
  for (const role of ["HRMgr", "Admin"]) {
    const cap = supplyRoleCapabilities(role);
    assert.equal(cap.canReadCatalog, true);
    assert.equal(cap.canManageCatalog, true);
    assert.equal(cap.canRecordLedger, true);
    assert.equal(cap.canReadDepartureSupplies, true);
    assert.equal(cap.canIssueAndReturn, true);
  }

  for (const role of ["RouteMgr", "Leader"]) {
    const cap = supplyRoleCapabilities(role);
    assert.equal(cap.canReadCatalog, false);
    assert.equal(cap.canManageCatalog, false);
    assert.equal(cap.canRecordLedger, false);
    assert.equal(cap.canReadDepartureSupplies, true);
    assert.equal(cap.canIssueAndReturn, false);
  }

  for (const role of ["Customer", "Guest", "", "Accountant"]) {
    const cap = supplyRoleCapabilities(role);
    assert.equal(cap.canReadCatalog, false);
    assert.equal(cap.canManageCatalog, false);
    assert.equal(cap.canRecordLedger, false);
    assert.equal(cap.canReadDepartureSupplies, false);
    assert.equal(cap.canIssueAndReturn, false);
  }
});

test("supplyReadScope isolates staff and leader supply portals by authentication, role and user_id", () => {
  assert.equal(supplyReadScope("staff", "loading", { user_id: 4, role: "HRMgr" }), null);
  assert.equal(supplyReadScope("staff", "unauthenticated", { user_id: 4, role: "HRMgr" }), null);
  assert.equal(supplyReadScope("staff", "authenticated", { user_id: 0, role: "HRMgr" }), null);
  assert.equal(supplyReadScope("staff", "authenticated", { user_id: 4, role: "HRMgr" }), "staff-supplies:HRMgr:4");
  assert.equal(supplyReadScope("staff", "authenticated", { user_id: 5, role: "RouteMgr" }), "staff-supplies:RouteMgr:5");
  assert.equal(supplyReadScope("staff", "authenticated", { user_id: 1, role: "Admin" }), "staff-supplies:Admin:1");
  assert.equal(supplyReadScope("staff", "authenticated", { user_id: 6, role: "Leader" }), null);
  assert.equal(supplyReadScope("staff", "authenticated", { user_id: 9, role: "Customer" }), null);

  assert.equal(supplyReadScope("leader", "authenticated", { user_id: 6, role: "Leader" }), "leader-supplies:Leader:6");
  assert.equal(supplyReadScope("leader", "authenticated", { user_id: 1, role: "Admin" }), "leader-supplies:Admin:1");
  assert.equal(supplyReadScope("leader", "authenticated", { user_id: 4, role: "HRMgr" }), null);
  assert.equal(supplyReadScope("leader", "authenticated", { user_id: 5, role: "RouteMgr" }), null);
});

test("validateCatalogItemDraft validates SKU, name, category, canonical unit and non-negative integer minStock", () => {
  const valid = validateCatalogItemDraft({
    sku: " nuoc-500ml ",
    name: " Nước suối đóng chai 500ml ",
    category: "Nước uống",
    unit: "chai",
    minStock: "120",
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.value, {
    sku: "NUOC-500ML",
    name: "Nước suối đóng chai 500ml",
    category: "Nước uống",
    unit: "chai",
    minStock: 120,
  });

  const invalid = validateCatalogItemDraft({
    sku: "!",
    name: "A",
    category: "Khác",
    unit: "tấn",
    minStock: "-5",
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.sku);
  assert.ok(invalid.errors.name);
  assert.ok(invalid.errors.category);
  assert.ok(invalid.errors.unit);
  assert.ok(invalid.errors.minStock);
});

test("validateStockInDraft enforces active item, matching unit, positive integer quantity and note", () => {
  const item = {
    id: 10,
    sku: "NUOC-500ML",
    name: "Nước suối 500ml",
    category: "Nước uống",
    unit: "thùng",
    currentStock: 15,
    minStock: 10,
    isActive: true,
  };

  const ok = validateStockInDraft({ itemId: 10, unit: "thùng", quantity: "25", note: "Nhập kho đợt cuối tuần" }, item);
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.value, { itemId: 10, unit: "thùng", quantity: 25, note: "Nhập kho đợt cuối tuần" });

  const mismatchUnit = validateStockInDraft({ itemId: 10, unit: "chai", quantity: "10", note: "Nhập lẻ" }, item);
  assert.equal(mismatchUnit.valid, false);
  assert.match(mismatchUnit.errors.unit ?? "", /đơn vị/i);

  const badQty = validateStockInDraft({ itemId: 10, unit: "thùng", quantity: "0", note: "" }, item);
  assert.equal(badQty.valid, false);
  assert.ok(badQty.errors.quantity);
  assert.ok(badQty.errors.note);

  const inactive = validateStockInDraft({ itemId: 10, unit: "thùng", quantity: "5", note: "Nhập thêm" }, { ...item, isActive: false });
  assert.equal(inactive.valid, false);
  assert.ok(inactive.errors.itemId);
});

test("validateDepartureIssueDraft detects stock shortage and unit mismatch before issuing to a departure", () => {
  const item = {
    id: 12,
    sku: "BANH-NL",
    name: "Bánh năng lượng trekking",
    category: "Đồ ăn",
    unit: "hộp",
    currentStock: 18,
    minStock: 20,
    isActive: true,
  };

  const shortage = validateDepartureIssueDraft(
    { departureId: 301, itemId: 12, unit: "hộp", quantity: "25", note: "Cấp cho đoàn Tà Năng" },
    item,
  );
  assert.equal(shortage.valid, false);
  assert.deepEqual(shortage.shortage, {
    requested: 25,
    available: 18,
    deficit: 7,
    unit: "hộp",
  });
  assert.match(shortage.errors.quantity ?? "", /thiếu 7 hộp/i);

  const valid = validateDepartureIssueDraft(
    { departureId: 301, itemId: 12, unit: "hộp", quantity: "18", note: "Cấp đủ tồn hiện có" },
    item,
  );
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.value, {
    departureId: 301,
    itemId: 12,
    unit: "hộp",
    quantity: 18,
    note: "Cấp đủ tồn hiện có",
  });
});

test("validateDepartureReturnDraft blocks returning more than remaining issued quantity or wrong unit", () => {
  const allocation = {
    id: 501,
    departureId: 301,
    departureLabel: "Chứa Chan — 24/11/2026 05:30",
    itemId: 12,
    sku: "BANH-NL",
    itemName: "Bánh năng lượng trekking",
    unit: "hộp",
    issuedQuantity: 18,
    returnedQuantity: 5,
    issuedAt: "2026-11-16T01:00:00.000Z",
    actorName: "Trần Quản Lý Kho",
  };

  assert.equal(remainingAllocatableReturn(allocation), 13);

  const excess = validateDepartureReturnDraft(
    { allocationId: 501, unit: "hộp", quantity: "14", note: "Hoàn nhập sau chuyến" },
    allocation,
  );
  assert.equal(excess.valid, false);
  assert.deepEqual(excess.excess, {
    requested: 14,
    remainingIssued: 13,
    overflow: 1,
    unit: "hộp",
  });
  assert.match(excess.errors.quantity ?? "", /vượt quá/i);

  const wrongUnit = validateDepartureReturnDraft(
    { allocationId: 501, unit: "gói", quantity: "3", note: "Hoàn nhập" },
    allocation,
  );
  assert.equal(wrongUnit.valid, false);
  assert.ok(wrongUnit.errors.unit);

  const valid = validateDepartureReturnDraft(
    { allocationId: 501, unit: "hộp", quantity: "13", note: "Hoàn nhập vật tư nguyên niêm phong" },
    allocation,
  );
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.value, {
    allocationId: 501,
    unit: "hộp",
    quantity: 13,
    note: "Hoàn nhập vật tư nguyên niêm phong",
  });
});

test("stockHealthStatus and classifySupplyMutationError distinguish out-of-stock, low-stock and 409 conflicts", () => {
  assert.equal(stockHealthStatus({ currentStock: 0, minStock: 10 }), "out");
  assert.equal(stockHealthStatus({ currentStock: 10, minStock: 10 }), "low");
  assert.equal(stockHealthStatus({ currentStock: 11, minStock: 10 }), "ok");

  const stockConflict = classifySupplyMutationError(
    new BookingClientError(409, "INSUFFICIENT_STOCK", "Tồn kho chỉ còn 4 thùng"),
  );
  assert.equal(stockConflict.kind, "stock-shortage");
  assert.equal(stockConflict.shouldRefresh, true);

  const concurrentConflict = classifySupplyMutationError(
    new BookingClientError(409, "RESOURCE_CONFLICT", "Bản ghi vừa được cập nhật"),
  );
  assert.equal(concurrentConflict.kind, "concurrency-conflict");
  assert.equal(concurrentConflict.shouldRefresh, true);

  const forbidden = classifySupplyMutationError(
    new BookingClientError(403, "FORBIDDEN", "Không đủ quyền"),
  );
  assert.equal(forbidden.kind, "forbidden");
  assert.equal(forbidden.shouldRefresh, false);
});
