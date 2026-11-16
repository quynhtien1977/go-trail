import { BookingClientError } from "./booking-client";

// Presentation models for SCRUM-70 (I04). Map from future authorized I02/I03 endpoints when available.
export const SUPPLY_CATEGORIES = ["Nước uống", "Đồ ăn", "Y tế", "Dụng cụ đoàn"] as const;
export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number];

export const SUPPLY_UNITS = ["chai", "thùng", "hộp", "gói", "cái", "bộ", "suất", "kg", "lít"] as const;
export type SupplyUnit = (typeof SUPPLY_UNITS)[number];

export type SupplyCatalogItemView = {
  id: number;
  sku: string;
  name: string;
  category: SupplyCategory;
  unit: SupplyUnit;
  currentStock: number;
  minStock: number;
  isActive: boolean;
};

export type SupplyLedgerMovementType = "StockIn" | "IssueToDeparture" | "ReturnFromDeparture";

export type SupplyLedgerEntryView = {
  id: number;
  itemId: number;
  sku: string;
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
  sku: string;
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
  updatedAt: string;
};

export type CatalogItemMutationInput = {
  id?: number;
  sku: string;
  name: string;
  category: SupplyCategory;
  unit: SupplyUnit;
  minStock: number;
  isActive?: boolean;
};

export type StockInMutationInput = {
  itemId: number;
  unit: SupplyUnit;
  quantity: number;
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
      scopeLabel: "Quản lý danh mục, nhập/xuất kho và cấp/hoàn nhập theo chuyến",
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
  return (SUPPLY_UNITS as readonly string[]).includes(value);
}

export function isSupplyCategory(value: string): value is SupplyCategory {
  return (SUPPLY_CATEGORIES as readonly string[]).includes(value);
}

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
  sku: string;
  name: string;
  category: string;
  unit: string;
  minStock: string | number;
}): ValidationResult<
  { sku: string; name: string; category: SupplyCategory; unit: SupplyUnit; minStock: number },
  Record<"sku" | "name" | "category" | "unit" | "minStock", string>
> {
  const errors: Partial<Record<"sku" | "name" | "category" | "unit" | "minStock", string>> = {};
  const sku = draft.sku.trim().toUpperCase();
  const name = draft.name.trim();
  const category = draft.category.trim();
  const unit = draft.unit.trim();
  const minStock = parseIntegerString(draft.minStock);

  if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(sku)) {
    errors.sku = "Mã vật tư gồm 2–32 ký tự chữ hoa, số hoặc dấu gạch ngang.";
  }
  if (name.length < 2 || name.length > 120) {
    errors.name = "Tên vật tư cần từ 2 đến 120 ký tự.";
  }
  if (!isSupplyCategory(category)) {
    errors.category = "Vui lòng chọn nhóm vật tư hợp lệ.";
  }
  if (!isSupplyUnit(unit)) {
    errors.unit = "Vui lòng chọn đơn vị tính hợp lệ trong danh mục chuẩn.";
  }
  if (minStock === null || minStock < 0 || minStock > 100_000) {
    errors.minStock = "Ngưỡng cảnh báo tồn tối thiểu phải là số nguyên từ 0 đến 100.000.";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      sku,
      name,
      category: category as SupplyCategory,
      unit: unit as SupplyUnit,
      minStock: minStock!,
    },
    errors: {},
  };
}

export function validateStockInDraft(
  draft: { itemId: number; unit: string; quantity: string | number; note: string },
  item?: SupplyCatalogItemView | null,
): ValidationResult<
  StockInMutationInput,
  Record<"itemId" | "unit" | "quantity" | "note", string>
> {
  const errors: Partial<Record<"itemId" | "unit" | "quantity" | "note", string>> = {};
  const unit = draft.unit.trim();
  const quantity = parseIntegerString(draft.quantity);
  const note = draft.note.trim();

  if (!item || !Number.isSafeInteger(draft.itemId) || draft.itemId < 1) {
    errors.itemId = "Vui lòng chọn vật tư cần nhập kho.";
  } else if (!item.isActive) {
    errors.itemId = "Vật tư này đang tạm ngừng sử dụng, không thể tạo phiếu nhập mới.";
  }

  if (!isSupplyUnit(unit)) {
    errors.unit = "Đơn vị tính không hợp lệ.";
  } else if (item && unit !== item.unit) {
    errors.unit = `Đơn vị nhập phải khớp với đơn vị chuẩn của vật tư (${item.unit}).`;
  }

  if (quantity === null || quantity < 1 || quantity > 100_000) {
    errors.quantity = "Số lượng nhập kho phải là số nguyên dương từ 1 đến 100.000.";
  }

  if (note.length < 2 || note.length > 200) {
    errors.note = "Vui lòng ghi rõ nguồn nhập hoặc đợt nhập kho (2–200 ký tự).";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      itemId: draft.itemId,
      unit: unit as SupplyUnit,
      quantity: quantity!,
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

  if (quantity === null || quantity < 1 || quantity > 100_000) {
    errors.quantity = "Số lượng cấp phải là số nguyên dương từ 1 đến 100.000.";
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

  if (note.length < 2 || note.length > 200) {
    errors.note = "Vui lòng nhập ghi chú cấp phát cho đoàn (2–200 ký tự).";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, shortage };
  }

  return {
    valid: true,
    value: {
      departureId: draft.departureId,
      itemId: draft.itemId,
      unit: unit as SupplyUnit,
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

  if (quantity === null || quantity < 1 || quantity > 100_000) {
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

  if (note.length < 2 || note.length > 200) {
    errors.note = "Vui lòng ghi rõ tình trạng vật tư hoàn nhập (2–200 ký tự).";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, excess };
  }

  return {
    valid: true,
    value: {
      allocationId: draft.allocationId,
      unit: unit as SupplyUnit,
      quantity: quantity!,
      note,
    },
    errors: {},
  };
}

export function stockHealthStatus(
  item: Pick<SupplyCatalogItemView, "currentStock" | "minStock">,
): "out" | "low" | "ok" {
  if (item.currentStock <= 0) return "out";
  if (item.currentStock <= item.minStock) return "low";
  return "ok";
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
        title: "Không đủ quyền thao tác",
        message: "Tài khoản hiện tại không có quyền thực hiện thao tác nhập/xuất hoặc cấp vật tư này.",
        shouldRefresh: false,
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
        title: "Xung đột cập nhật đồng thời",
        message:
          error.message ||
          "Dữ liệu kho hoặc phiếu cấp theo chuyến vừa được nhân sự khác cập nhật cùng lúc. Vui lòng kiểm tra số liệu mới nhất trước khi gửi lại.",
        shouldRefresh: true,
      };
    }
    if (error.status === 422) {
      return {
        kind: "validation",
        title: "Dữ liệu chưa hợp lệ",
        message: error.message || "Vui lòng kiểm tra lại đơn vị tính và số lượng đã nhập.",
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
