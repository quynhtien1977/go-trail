import assert from "node:assert/strict";
import { test } from "node:test";
import { BookingClientError } from "../src/lib/booking-client.ts";
import {
  buildCreateSupplyItemPayload,
  buildReceiveSupplyPayload,
  buildSupplyCatalogQueryParams,
  buildUpdateSupplyItemPayload,
  classifySupplyMutationError,
  createSupplyWorkspaceSource,
  formatSupplyCategory,
  formatSupplyCode,
  generateSupplyIdempotencyKey,
  mapSupplyItemDtoToView,
  remainingAllocatableReturn,
  stockHealthStatus,
  supplyReadScope,
  supplyRoleCapabilities,
  SUPPLY_CATEGORIES,
  validateCatalogItemDraft,
  validateDepartureIssueDraft,
  validateDepartureReturnDraft,
  validateStockInDraft,
} from "../src/lib/supply-ui.ts";
import {
  createSupplyItemSchema,
  receiveSupplySchema,
  supplyCategories,
  supplyItemQuerySchema,
  updateSupplyItemSchema,
} from "../src/schemas/inventory.ts";

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

test("SUPPLY_CATEGORIES matches I02 schema enum and formats all four Vietnamese labels", () => {
  assert.deepEqual(SUPPLY_CATEGORIES, supplyCategories);
  assert.equal(formatSupplyCategory("Food"), "Đồ ăn");
  assert.equal(formatSupplyCategory("Drink"), "Nước uống");
  assert.equal(formatSupplyCategory("Gear"), "Dụng cụ đoàn");
  assert.equal(formatSupplyCategory("Medical"), "Y tế");
  assert.equal(formatSupplyCode(7), "#7");
});

test("mapSupplyItemDtoToView maps I02 DTO accurately without invented SKU or minStock", () => {
  const mapped = mapSupplyItemDtoToView({
    item_id: 14,
    name: "Nước suối",
    category: "Drink",
    unit: "chai 500ml",
    is_active: true,
    on_hand: 216,
    created_at: "2026-11-23T01:00:00.000Z",
  });
  assert.deepEqual(mapped, {
    id: 14,
    name: "Nước suối",
    category: "Drink",
    unit: "chai 500ml",
    currentStock: 216,
    isActive: true,
    createdAt: "2026-11-23T01:00:00.000Z",
  });
});

test("buildSupplyCatalogQueryParams strictly satisfies supplyItemQuerySchema", () => {
  const allParams = new URLSearchParams(
    buildSupplyCatalogQueryParams({ category: "all", search: "Nước", departureId: 9 }),
  );
  assert.deepEqual(supplyItemQuerySchema.parse(Object.fromEntries(allParams)), {
    page: 1,
    pageSize: 50,
  });

  const medicalParams = new URLSearchParams(
    buildSupplyCatalogQueryParams({ category: "Medical", search: "bông", departureId: 3 }),
  );
  assert.deepEqual(supplyItemQuerySchema.parse(Object.fromEntries(medicalParams)), {
    page: 1,
    pageSize: 50,
    category: "Medical",
  });

  const bogusParams = new URLSearchParams(
    buildSupplyCatalogQueryParams({ category: "NotACategory" }),
  );
  assert.deepEqual(supplyItemQuerySchema.parse(Object.fromEntries(bogusParams)), {
    page: 1,
    pageSize: 50,
  });
});

test("validateCatalogItemDraft supports Medical category, free-text unit and produces valid create/update payloads", () => {
  const valid = validateCatalogItemDraft({
    name: " Bộ sơ cứu y tế ",
    category: "Medical",
    unit: " bộ 12 món ",
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.value, {
    name: "Bộ sơ cứu y tế",
    category: "Medical",
    unit: "bộ 12 món",
  });

  const createPayload = buildCreateSupplyItemPayload(valid.value);
  assert.deepEqual(createSupplyItemSchema.parse(createPayload), {
    name: "Bộ sơ cứu y tế",
    category: "Medical",
    unit: "bộ 12 món",
  });

  const deactivatePayload = buildUpdateSupplyItemPayload({
    ...valid.value,
    id: 4,
    isActive: false,
  });
  assert.deepEqual(updateSupplyItemSchema.parse(deactivatePayload), {
    name: "Bộ sơ cứu y tế",
    category: "Medical",
    unit: "bộ 12 món",
    is_active: false,
  });

  const invalid = validateCatalogItemDraft({
    name: "   ",
    category: "Beverage",
    unit: "x".repeat(51),
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.name);
  assert.ok(invalid.errors.category);
  assert.ok(invalid.errors.unit);
});

test("validateStockInDraft and buildReceiveSupplyPayload enforce active item, matching free-text unit and receiveSupplySchema", () => {
  const item = {
    id: 10,
    name: "Nước suối",
    category: "Drink",
    unit: "chai 500ml",
    currentStock: 15,
    isActive: true,
    createdAt: "2026-11-23T00:00:00.000Z",
  };

  const key = generateSupplyIdempotencyKey();
  assert.match(key, /^[A-Za-z0-9_-]{16,64}$/);

  const ok = validateStockInDraft(
    { itemId: 10, unit: "chai 500ml", quantity: "25", idempotencyKey: key, note: "Nhập đợt cuối tuần" },
    item,
  );
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.value, {
    itemId: 10,
    unit: "chai 500ml",
    quantity: 25,
    idempotencyKey: key,
    note: "Nhập đợt cuối tuần",
  });
  assert.deepEqual(receiveSupplySchema.parse(buildReceiveSupplyPayload(ok.value)), {
    item_id: 10,
    quantity: 25,
    idempotency_key: key,
    note: "Nhập đợt cuối tuần",
  });

  const noNote = validateStockInDraft(
    { itemId: 10, unit: "chai 500ml", quantity: "5", idempotencyKey: key, note: "   " },
    item,
  );
  assert.equal(noNote.valid, true);
  assert.deepEqual(receiveSupplySchema.parse(buildReceiveSupplyPayload(noNote.value)), {
    item_id: 10,
    quantity: 5,
    idempotency_key: key,
    note: null,
  });

  const mismatchUnit = validateStockInDraft(
    { itemId: 10, unit: "thùng", quantity: "10", idempotencyKey: key, note: "Nhập lẻ" },
    item,
  );
  assert.equal(mismatchUnit.valid, false);
  assert.match(mismatchUnit.errors.unit ?? "", /đơn vị/i);

  const badQty = validateStockInDraft(
    { itemId: 10, unit: "chai 500ml", quantity: "0", idempotencyKey: "short", note: "n".repeat(501) },
    item,
  );
  assert.equal(badQty.valid, false);
  assert.ok(badQty.errors.quantity);
  assert.ok(badQty.errors.idempotencyKey);
  assert.ok(badQty.errors.note);

  const inactive = validateStockInDraft(
    { itemId: 10, unit: "chai 500ml", quantity: "5", idempotencyKey: key, note: "" },
    { ...item, isActive: false },
  );
  assert.equal(inactive.valid, false);
  assert.ok(inactive.errors.itemId);
});

test("createSupplyWorkspaceSource queries strict I02 endpoints, reuses idempotency key on retry and omits I03 mutations", async () => {
  const requests = [];
  let failFirstReceive = true;

  const mockFetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const parsedBody = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, body: parsedBody });

    if (url.startsWith("/api/staff/supplies?") && method === "GET") {
      return Response.json({
        data: {
          items: [
            {
              item_id: 3,
              name: "Băng gạc y tế",
              category: "Medical",
              unit: "cuộn",
              is_active: true,
              on_hand: 0,
              created_at: "2026-11-23T02:00:00.000Z",
            },
          ],
          pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
        },
      });
    }

    if (url === "/api/staff/supplies" && method === "POST") {
      return Response.json({
        data: {
          item_id: 4,
          name: "Bộ sơ cứu",
          category: "Medical",
          unit: "bộ",
          is_active: true,
          on_hand: 0,
          created_at: "2026-11-23T02:00:00.000Z",
        },
      }, { status: 201 });
    }

    if (url === "/api/staff/supplies/3" && method === "PATCH") {
      return Response.json({
        data: {
          item_id: 3,
          name: "Băng gạc y tế",
          category: "Medical",
          unit: "cuộn",
          is_active: false,
          on_hand: 0,
          created_at: "2026-11-23T02:00:00.000Z",
        },
      });
    }

    if (url === "/api/staff/supplies/receive" && method === "POST") {
      if (failFirstReceive) {
        failFirstReceive = false;
        throw new Error("Simulated network interruption");
      }
      return Response.json({
        data: {
          txn_id: 99,
          item_id: parsedBody.item_id,
          txn_type: "Receive",
          quantity: parsedBody.quantity,
          departure_id: null,
          created_by_user_id: 2,
          idempotency_key: parsedBody.idempotency_key,
          note: parsedBody.note,
          created_at: "2026-11-23T02:05:00.000Z",
        },
      }, { status: 201 });
    }

    return Response.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  };

  const source = createSupplyWorkspaceSource(mockFetch);
  assert.equal(source.issueToDeparture, undefined);
  assert.equal(source.returnFromDeparture, undefined);

  const snapshot = await source.readWorkspace(
    { category: "Medical", search: "Băng", departureId: 2 },
    new AbortController().signal,
  );
  assert.equal(requests[0].url, "/api/staff/supplies?page=1&pageSize=50&category=Medical");
  assert.equal(snapshot.catalog.length, 1);
  assert.equal(snapshot.catalog[0].category, "Medical");
  assert.equal(snapshot.catalog[0].currentStock, 0);
  assert.deepEqual(snapshot.ledger, []);
  assert.deepEqual(snapshot.departures, []);
  assert.deepEqual(snapshot.allocations, []);

  await source.saveCatalogItem({ name: "Bộ sơ cứu", category: "Medical", unit: "bộ" });
  assert.deepEqual(createSupplyItemSchema.parse(requests[1].body), {
    name: "Bộ sơ cứu",
    category: "Medical",
    unit: "bộ",
  });

  await source.saveCatalogItem({
    id: 3,
    name: "Băng gạc y tế",
    category: "Medical",
    unit: "cuộn",
    isActive: false,
  });
  assert.equal(requests[2].url, "/api/staff/supplies/3");
  assert.deepEqual(updateSupplyItemSchema.parse(requests[2].body), {
    name: "Băng gạc y tế",
    category: "Medical",
    unit: "cuộn",
    is_active: false,
  });

  const retryKey = generateSupplyIdempotencyKey();
  const receiptInput = {
    itemId: 4,
    unit: "bộ",
    quantity: 12,
    idempotencyKey: retryKey,
    note: "Nhập đợt 1",
  };
  await assert.rejects(() => source.recordStockIn(receiptInput), /Simulated network interruption/);
  await source.recordStockIn(receiptInput);

  assert.equal(requests[3].url, "/api/staff/supplies/receive");
  assert.equal(requests[4].url, "/api/staff/supplies/receive");
  assert.deepEqual(requests[3].body, requests[4].body);
  assert.equal(receiveSupplySchema.parse(requests[4].body).idempotency_key, retryKey);
});

test("validateDepartureIssueDraft detects stock shortage and unit mismatch before issuing to a departure", () => {
  const item = {
    id: 12,
    name: "Bánh năng lượng trekking",
    category: "Food",
    unit: "hộp",
    currentStock: 18,
    isActive: true,
    createdAt: "2026-11-23T00:00:00.000Z",
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

test("stockHealthStatus has two states and classifySupplyMutationError maps 403/409/422 cleanly", () => {
  assert.equal(stockHealthStatus({ currentStock: 0 }), "out");
  assert.equal(stockHealthStatus({ currentStock: 1 }), "ok");
  assert.equal(stockHealthStatus({ currentStock: 50 }), "ok");

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
  assert.match(forbidden.title, /không có quyền/i);
  assert.equal(forbidden.shouldRefresh, false);

  const invalid = classifySupplyMutationError(
    new BookingClientError(422, "INVALID_INPUT", "Dữ liệu không hợp lệ."),
  );
  assert.equal(invalid.kind, "validation");
  assert.equal(invalid.shouldRefresh, false);
});
