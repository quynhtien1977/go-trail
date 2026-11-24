import type { Page } from "@/schemas/catalog";
import {
  supplyCategories,
  type CreateSupplyItemInput,
  type ReceiveSupplyInput,
  type SupplyCategory,
  type SupplyItemDto,
  type SupplyTransactionDto,
  type UpdateSupplyItemInput,
} from "@/schemas/inventory";
import { BookingClientError } from "./booking-client";

export const SUPPLY_CATEGORIES = supplyCategories;
export type { SupplyCategory };

export const SUPPLY_CATEGORY_LABELS: Record<SupplyCategory, string> = {
  Food: "Đồ ăn",
  Drink: "Nước uống",
  Gear: "Dụng cụ đoàn",
  Medical: "Y tế",
};

export function formatSupplyCategory(category: SupplyCategory): string {
  return SUPPLY_CATEGORY_LABELS[category] ?? category;
}

export function formatSupplyCode(itemId: number): string {
  return `#${itemId}`;
}

export const SUPPLY_UNIT_SUGGESTIONS = [
  "chai",
  "chai 500ml",
  "thùng",
  "hộp",
  "gói",
  "gói 100g",
  "ổ",
  "cái",
  "bộ",
  "suất",
  "kg",
  "lít",
] as const;

export const SUPPLY_UNITS = SUPPLY_UNIT_SUGGESTIONS;
export type SupplyUnit = string;

export type SupplyCatalogItemView = {
  id: number;
  name: string;
  category: SupplyCategory;
  unit: SupplyUnit;
  currentStock: number;
  isActive: boolean;
  createdAt: string;
};

export type SupplyLedgerMovementType = "StockIn" | "IssueToDeparture" | "ReturnFromDeparture";

export type SupplyLedgerEntryView = {
  id: number;
  itemId: number;
  itemName: string;
  unit: SupplyUnit;
  movementType: SupplyLedgerMovementType;
  quantityDelta: number;
  balanceAfter: number;
  departureId: number | null;
  departureLabel: string | null;
  actorName: string;
  note: string;
  recordedAt: string;
};

export type DepartureSupplyOptionView = {
  departureId: number;
  tripName: string;
  departureAt: string;
  status: "Draft" | "Open" | "Closed" | "Confirmed" | "Running" | "Ended";
  responsibleName: string | null;
};

export type DepartureSupplyAllocationView = {
  id: number;
  departureId: number;
  departureLabel: string;
  itemId: number;
  itemName: string;
  unit: SupplyUnit;
  issuedQuantity: number;
  returnedQuantity: number;
  issuedAt: string;
  actorName: string;
  note?: string | null;
};

export type SupplyWorkspaceSnapshot = {
  catalog: SupplyCatalogItemView[];
  ledger: SupplyLedgerEntryView[];
  departures: DepartureSupplyOptionView[];
  allocations: DepartureSupplyAllocationView[];
  totalCatalogItems?: number;
  catalogHasMore?: boolean;
  updatedAt: string;
};

export type CatalogItemMutationInput = {
  id?: number;
  name: string;
  category: SupplyCategory;
  unit: SupplyUnit;
  isActive?: boolean;
};

export type StockInMutationInput = {
  itemId: number;
  unit: SupplyUnit;
  quantity: number;
  idempotencyKey: string;
  note: string;
};

export type DepartureIssueMutationInput = {
  departureId: number;
  itemId: number;
  unit: SupplyUnit;
  quantity: number;
  note: string;
};

export type DepartureReturnMutationInput = {
  allocationId: number;
  unit: SupplyUnit;
  quantity: number;
  note: string;
};

export type SupplyWorkspaceQuery = {
  departureId?: number | null;
  category?: string;
  search?: string;
};

export type SupplyWorkspaceSource = {
  readWorkspace: (query: SupplyWorkspaceQuery, signal: AbortSignal) => Promise<SupplyWorkspaceSnapshot>;
  saveCatalogItem?: (input: CatalogItemMutationInput) => Promise<void>;
  recordStockIn?: (input: StockInMutationInput) => Promise<void>;
  issueToDeparture?: (input: DepartureIssueMutationInput) => Promise<void>;
  returnFromDeparture?: (input: DepartureReturnMutationInput) => Promise<void>;
};

export type SupplyRoleCapabilities = {
  canReadCatalog: boolean;
  canManageCatalog: boolean;
  canRecordLedger: boolean;
  canReadDepartureSupplies: boolean;
  canIssueAndReturn: boolean;
  scopeLabel: string;
};

export function supplyRoleCapabilities(role?: string | null): SupplyRoleCapabilities {
  if (role === "HRMgr" || role === "Admin") {
    return {
      canReadCatalog: true,
      canManageCatalog: true,
      canRecordLedger: true,
      canReadDepartureSupplies: true,
      canIssueAndReturn: true,
      scopeLabel: "Quản lý danh mục, nhập kho và theo dõi vật tư",
    };
  }
  if (role === "RouteMgr") {
    return {
      canReadCatalog: false,
      canManageCatalog: false,
      canRecordLedger: false,
      canReadDepartureSupplies: true,
      canIssueAndReturn: false,
      scopeLabel: "Chỉ xem vật tư của các chuyến phụ trách",
    };
  }
  if (role === "Leader") {
    return {
      canReadCatalog: false,
      canManageCatalog: false,
      canRecordLedger: false,
      canReadDepartureSupplies: true,
      canIssueAndReturn: false,
      scopeLabel: "Chỉ xem vật tư của các chuyến được phân công",
    };
  }
  return {
    canReadCatalog: false,
    canManageCatalog: false,
    canRecordLedger: false,
    canReadDepartureSupplies: false,
    canIssueAndReturn: false,
    scopeLabel: "Không có quyền truy cập phân hệ vật tư",
  };
}

export function supplyReadScope(
  portal: "staff" | "leader",
  status: string,
  user?: { user_id: number; role: string } | null,
): string | null {
  if (status !== "authenticated" || !user || !Number.isSafeInteger(user.user_id) || user.user_id < 1) {
    return null;
  }
  if (portal === "staff") {
    if (user.role !== "HRMgr" && user.role !== "Admin" && user.role !== "RouteMgr") return null;
    return `staff-supplies:${user.role}:${user.user_id}`;
  }
  if (user.role !== "Leader" && user.role !== "Admin") return null;
  return `leader-supplies:${user.role}:${user.user_id}`;
}

export function isSupplyUnit(value: string): value is SupplyUnit {
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 50;
}

export function isSupplyCategory(value: string): value is SupplyCategory {
  return (SUPPLY_CATEGORIES as readonly string[]).includes(value);
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function isSupplyIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY_PATTERN.test(value.trim());
}

export function generateSupplyIdempotencyKey(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("Secure random generator is required for supply idempotency keys.");
}

export function mapSupplyItemDtoToView(dto: SupplyItemDto): SupplyCatalogItemView {
  return {
    id: dto.item_id,
    name: dto.name,
    category: dto.category,
    unit: dto.unit,
    currentStock: dto.on_hand,
    isActive: dto.is_active,
    createdAt: dto.created_at,
  };
}

export function buildSupplyCatalogQueryParams(query: SupplyWorkspaceQuery): string {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "50",
  });
  const category = query.category?.trim();
  if (category && category !== "all" && isSupplyCategory(category)) {
    params.set("category", category);
  }
  return params.toString();
}

export function buildCreateSupplyItemPayload(
  input: CatalogItemMutationInput,
): CreateSupplyItemInput {
  return {
    name: input.name.trim(),
    category: input.category,
    unit: input.unit.trim(),
  };
}

export function buildUpdateSupplyItemPayload(
  input: CatalogItemMutationInput,
): UpdateSupplyItemInput {
  return {
    name: input.name.trim(),
    category: input.category,
    unit: input.unit.trim(),
    ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
  };
}

export function buildReceiveSupplyPayload(
  input: StockInMutationInput,
): ReceiveSupplyInput {
  const note = input.note.trim();
  return {
    item_id: input.itemId,
    quantity: input.quantity,
    idempotency_key: input.idempotencyKey.trim(),
    note: note.length > 0 ? note : null,
  };
}

async function requestSupplyJson<T>(
  fetchFn: typeof fetch,
  url: string,
  signal?: AbortSignal,
  request?: { method: "POST" | "PATCH"; body: unknown },
): Promise<T> {
  const response = await fetchFn(url, {
    method: request?.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(request ? { "Content-Type": "application/json" } : {}),
    },
    ...(request ? { body: JSON.stringify(request.body) } : {}),
    cache: "no-store",
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new BookingClientError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "Không thể xử lý yêu cầu kho vật tư.",
    );
  }
  if (!body?.data) {
    throw new BookingClientError(
      502,
      "INVALID_RESPONSE",
      "Dữ liệu kho vật tư trả về không hợp lệ.",
    );
  }
  return body.data as T;
}

export function createSupplyWorkspaceSource(
  fetchFn: typeof fetch = (...args) => globalThis.fetch(...args),
): SupplyWorkspaceSource {
  return {
    async readWorkspace(query, signal) {
      const queryString = buildSupplyCatalogQueryParams(query);
      const page = await requestSupplyJson<Page<SupplyItemDto>>(
        fetchFn,
        `/api/staff/supplies?${queryString}`,
        signal,
      );
      return {
        catalog: page.items.map(mapSupplyItemDtoToView),
        ledger: [],
        departures: [],
        allocations: [],
        totalCatalogItems: page.pagination.totalItems,
        catalogHasMore: page.pagination.totalPages > page.pagination.page,
        updatedAt: new Date().toISOString(),
      };
    },
    async saveCatalogItem(input) {
      if (input.id !== undefined) {
        await requestSupplyJson<SupplyItemDto>(
          fetchFn,
          `/api/staff/supplies/${input.id}`,
          undefined,
          { method: "PATCH", body: buildUpdateSupplyItemPayload(input) },
        );
        return;
      }
      await requestSupplyJson<SupplyItemDto>(
        fetchFn,
        "/api/staff/supplies",
        undefined,
        { method: "POST", body: buildCreateSupplyItemPayload(input) },
      );
    },
    async recordStockIn(input) {
      await requestSupplyJson<SupplyTransactionDto>(
        fetchFn,
        "/api/staff/supplies/receive",
        undefined,
        { method: "POST", body: buildReceiveSupplyPayload(input) },
      );
    },
  };
}

export const supplyWorkspaceSource: SupplyWorkspaceSource = createSupplyWorkspaceSource();

function parseIntegerString(raw: string | number): number | null {
  const text = String(raw ?? "").trim();
  if (!/^-?\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export type ValidationResult<T, E extends Record<string, string>> =
  | { valid: true; value: T; errors: Partial<E> }
  | { valid: false; errors: Partial<E> };

export function validateCatalogItemDraft(draft: {
  name: string;
  category: string;
  unit: string;
  isActive?: boolean;
}): ValidationResult<
  CatalogItemMutationInput,
  Record<"name" | "category" | "unit", string>
> {
  const errors: Partial<Record<"name" | "category" | "unit", string>> = {};
  const name = draft.name.trim();
  const category = draft.category.trim();
  const unit = draft.unit.trim();

  if (name.length < 1 || name.length > 100) {
    errors.name = "Tên vật tư cần từ 1 đến 100 ký tự.";
  }
  if (!isSupplyCategory(category)) {
    errors.category = "Vui lòng chọn nhóm vật tư hợp lệ.";
  }
  if (!isSupplyUnit(unit)) {
    errors.unit = "Đơn vị tính cần từ 1 đến 50 ký tự.";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      name,
      category: category as SupplyCategory,
      unit,
      ...(draft.isActive !== undefined ? { isActive: draft.isActive } : {}),
    },
    errors: {},
  };
}

export function validateStockInDraft(
  draft: {
    itemId: number;
    unit: string;
    quantity: string | number;
    idempotencyKey: string;
    note: string;
  },
  item?: SupplyCatalogItemView | null,
): ValidationResult<
  StockInMutationInput,
  Record<"itemId" | "unit" | "quantity" | "idempotencyKey" | "note", string>
> {
  const errors: Partial<Record<"itemId" | "unit" | "quantity" | "idempotencyKey" | "note", string>> = {};
  const unit = draft.unit.trim();
  const quantity = parseIntegerString(draft.quantity);
  const idempotencyKey = draft.idempotencyKey.trim();
  const note = draft.note.trim();

  if (!item || !Number.isSafeInteger(draft.itemId) || draft.itemId < 1) {
    errors.itemId = "Vui lòng chọn vật tư cần nhập kho.";
  } else if (!item.isActive) {
    errors.itemId = "Vật tư này đang tạm ngừng sử dụng, không thể tạo phiếu nhập mới.";
  }

  if (!isSupplyUnit(unit)) {
    errors.unit = "Đơn vị tính cần từ 1 đến 50 ký tự.";
  } else if (item && unit !== item.unit) {
    errors.unit = `Đơn vị nhập phải khớp với đơn vị chuẩn của vật tư (${item.unit}).`;
  }

  if (quantity === null || quantity < 1 || quantity > 1_000_000) {
    errors.quantity = "Số lượng nhập kho phải là số nguyên dương từ 1 đến 1.000.000.";
  }

  if (!isSupplyIdempotencyKey(idempotencyKey)) {
    errors.idempotencyKey = "Mã chống trùng lặp giao dịch không hợp lệ. Vui lòng mở lại biểu mẫu.";
  }

  if (note.length > 500) {
    errors.note = "Ghi chú phiếu nhập không được vượt quá 500 ký tự.";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      itemId: draft.itemId,
      unit,
      quantity: quantity!,
      idempotencyKey,
      note,
    },
    errors: {},
  };
}

export type StockShortageDetail = {
  requested: number;
  available: number;
  deficit: number;
  unit: SupplyUnit;
};

export function validateDepartureIssueDraft(
  draft: { departureId: number; itemId: number; unit: string; quantity: string | number; note: string },
  item?: SupplyCatalogItemView | null,
): (
  | { valid: true; value: DepartureIssueMutationInput; errors: Record<string, never>; shortage?: undefined }
  | {
      valid: false;
      errors: Partial<Record<"departureId" | "itemId" | "unit" | "quantity" | "note", string>>;
      shortage?: StockShortageDetail;
    }
) {
  const errors: Partial<Record<"departureId" | "itemId" | "unit" | "quantity" | "note", string>> = {};
  let shortage: StockShortageDetail | undefined;

  const unit = draft.unit.trim();
  const quantity = parseIntegerString(draft.quantity);
  const note = draft.note.trim();

  if (!Number.isSafeInteger(draft.departureId) || draft.departureId < 1) {
    errors.departureId = "Vui lòng chọn chuyến khởi hành cần cấp vật tư.";
  }

  if (!item || !Number.isSafeInteger(draft.itemId) || draft.itemId < 1) {
    errors.itemId = "Vui lòng chọn vật tư cần xuất cấp.";
  } else if (!item.isActive) {
    errors.itemId = "Vật tư này đang tạm ngừng sử dụng, không thể cấp cho chuyến.";
  }

  if (!isSupplyUnit(unit)) {
    errors.unit = "Đơn vị tính không hợp lệ.";
  } else if (item && unit !== item.unit) {
    errors.unit = `Đơn vị cấp phải khớp với đơn vị chuẩn của vật tư (${item.unit}).`;
  }

  if (quantity === null || quantity < 1 || quantity > 1_000_000) {
    errors.quantity = "Số lượng cấp phải là số nguyên dương từ 1 đến 1.000.000.";
  } else if (item && quantity > item.currentStock) {
    const deficit = quantity - item.currentStock;
    shortage = {
      requested: quantity,
      available: item.currentStock,
      deficit,
      unit: item.unit,
    };
    errors.quantity = `Tồn kho không đủ để cấp: hiện còn ${item.currentStock} ${item.unit}, yêu cầu ${quantity} ${item.unit} (thiếu ${deficit} ${item.unit}).`;
  }

  if (note.length < 2 || note.length > 500) {
    errors.note = "Vui lòng nhập ghi chú cấp phát cho đoàn (2–500 ký tự).";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, shortage };
  }

  return {
    valid: true,
    value: {
      departureId: draft.departureId,
      itemId: draft.itemId,
      unit,
      quantity: quantity!,
      note,
    },
    errors: {},
  };
}

export function remainingAllocatableReturn(
  allocation: Pick<DepartureSupplyAllocationView, "issuedQuantity" | "returnedQuantity">,
): number {
  return Math.max(0, allocation.issuedQuantity - allocation.returnedQuantity);
}

export type ReturnExcessDetail = {
  requested: number;
  remainingIssued: number;
  overflow: number;
  unit: SupplyUnit;
};

export function validateDepartureReturnDraft(
  draft: { allocationId: number; unit: string; quantity: string | number; note: string },
  allocation?: DepartureSupplyAllocationView | null,
): (
  | { valid: true; value: DepartureReturnMutationInput; errors: Record<string, never>; excess?: undefined }
  | {
      valid: false;
      errors: Partial<Record<"allocationId" | "unit" | "quantity" | "note", string>>;
      excess?: ReturnExcessDetail;
    }
) {
  const errors: Partial<Record<"allocationId" | "unit" | "quantity" | "note", string>> = {};
  let excess: ReturnExcessDetail | undefined;

  const unit = draft.unit.trim();
  const quantity = parseIntegerString(draft.quantity);
  const note = draft.note.trim();

  if (!allocation || !Number.isSafeInteger(draft.allocationId) || draft.allocationId < 1) {
    errors.allocationId = "Vui lòng chọn khoản vật tư đã cấp cần hoàn nhập.";
  }

  const remaining = allocation ? remainingAllocatableReturn(allocation) : 0;
  if (allocation && remaining <= 0) {
    errors.allocationId = "Khoản cấp vật tư này đã được hoàn nhập hết.";
  }

  if (!isSupplyUnit(unit)) {
    errors.unit = "Đơn vị tính không hợp lệ.";
  } else if (allocation && unit !== allocation.unit) {
    errors.unit = `Đơn vị hoàn nhập phải khớp với đơn vị đã cấp (${allocation.unit}).`;
  }

  if (quantity === null || quantity < 1 || quantity > 1_000_000) {
    errors.quantity = "Số lượng hoàn nhập phải là số nguyên dương.";
  } else if (allocation && remaining > 0 && quantity > remaining) {
    const overflow = quantity - remaining;
    excess = {
      requested: quantity,
      remainingIssued: remaining,
      overflow,
      unit: allocation.unit,
    };
    errors.quantity = `Số lượng hoàn nhập (${quantity} ${allocation.unit}) vượt quá số đã cấp còn lại của chuyến (${remaining} ${allocation.unit}).`;
  }

  if (note.length < 2 || note.length > 500) {
    errors.note = "Vui lòng ghi rõ tình trạng vật tư hoàn nhập (2–500 ký tự).";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, excess };
  }

  return {
    valid: true,
    value: {
      allocationId: draft.allocationId,
      unit,
      quantity: quantity!,
      note,
    },
    errors: {},
  };
}

export function stockHealthStatus(
  item: Pick<SupplyCatalogItemView, "currentStock">,
): "out" | "ok" {
  return item.currentStock <= 0 ? "out" : "ok";
}

export type SupplyMutationErrorClassification = {
  kind: "stock-shortage" | "concurrency-conflict" | "sign-in" | "forbidden" | "validation" | "error";
  title: string;
  message: string;
  shouldRefresh: boolean;
};

export function classifySupplyMutationError(error: unknown): SupplyMutationErrorClassification {
  if (error instanceof BookingClientError) {
    if (error.status === 401) {
      return {
        kind: "sign-in",
        title: "Phiên đăng nhập đã hết hạn",
        message: "Vui lòng đăng nhập lại cổng nội bộ để tiếp tục thao tác kho vật tư.",
        shouldRefresh: false,
      };
    }
    if (error.status === 403) {
      return {
        kind: "forbidden",
        title: "Không có quyền thao tác",
        message: "Tài khoản hiện tại không có quyền thực hiện thao tác kho vật tư này.",
        shouldRefresh: false,
      };
    }
    if (error.status === 404) {
      return {
        kind: "concurrency-conflict",
        title: "Không tìm thấy vật tư",
        message: error.message || "Vật tư không còn tồn tại. Hệ thống đã tải lại danh sách mới nhất.",
        shouldRefresh: true,
      };
    }
    if (error.status === 409) {
      if (error.code === "INSUFFICIENT_STOCK" || /tồn kho|thiếu/i.test(error.message)) {
        return {
          kind: "stock-shortage",
          title: "Thiếu tồn kho tại thời điểm xác nhận",
          message:
            error.message ||
            "Số lượng tồn kho thực tế vừa giảm và không còn đủ để xuất cấp. Hệ thống đã tải lại số tồn mới nhất.",
          shouldRefresh: true,
        };
      }
      return {
        kind: "concurrency-conflict",
        title: "Dữ liệu bị trùng hoặc xung đột trạng thái",
        message:
          "Tên vật tư đã tồn tại, vật tư đã ngừng sử dụng, hoặc mã giao dịch vừa được dùng với nội dung khác. Danh sách mới nhất đã được tải lại.",
        shouldRefresh: true,
      };
    }
    if (error.status === 422) {
      return {
        kind: "validation",
        title: "Dữ liệu chưa hợp lệ",
        message: error.message || "Vui lòng kiểm tra lại tên, nhóm, đơn vị tính và số lượng đã nhập.",
        shouldRefresh: false,
      };
    }
  }

  return {
    kind: "error",
    title: "Không thể hoàn tất thao tác",
    message: "Đã xảy ra lỗi khi kết nối dịch vụ kho vật tư. Vui lòng thử lại sau.",
    shouldRefresh: false,
  };
}
