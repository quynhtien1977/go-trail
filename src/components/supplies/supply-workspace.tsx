"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AlertTriangle, Boxes, FileClock, PackagePlus, RefreshCw, ShieldCheck } from "lucide-react";
import { formatVietnamDateTime } from "@/lib/catalog-client";
import {
  SUPPLY_CATEGORIES,
  SUPPLY_UNITS,
  classifySupplyMutationError,
  remainingAllocatableReturn,
  stockHealthStatus,
  supplyReadScope,
  validateCatalogItemDraft,
  validateDepartureIssueDraft,
  validateDepartureReturnDraft,
  validateStockInDraft,
  type DepartureSupplyAllocationView,
  type ReturnExcessDetail,
  type StockShortageDetail,
  type SupplyCatalogItemView,
  type SupplyMutationErrorClassification,
  type SupplyWorkspaceSource,
} from "@/lib/supply-ui";
import { useSupplyWorkspace, type SupplyWorkspacePhase } from "./use-supply-workspace";
import { SupplyActionDialog } from "./supply-action-dialog";

const controlClass =
  "min-h-11 rounded-[5px] border border-[#6B7280] bg-white px-3 text-sm text-[#212529] disabled:bg-neutral-100 disabled:text-[#5C636A]";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] border border-[#6B7280] bg-white px-4 text-sm font-semibold text-[#212529] hover:bg-neutral-50 disabled:bg-neutral-100 disabled:text-[#5C636A]";
const brandButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] bg-[#186734] px-4 text-sm font-semibold text-white hover:bg-[#125228] disabled:bg-neutral-200 disabled:text-[#5C636A]";
const primaryYellowButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] bg-[#FEBB02] px-4 text-sm font-bold text-black hover:bg-[#E5A800] disabled:bg-neutral-200 disabled:text-[#5C636A]";

const dateOptions: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

type ActiveTab = "catalog" | "ledger" | "departures";
type ActiveModal =
  | { type: "catalog"; item?: SupplyCatalogItemView }
  | { type: "stock-in"; itemId?: number }
  | { type: "issue"; itemId?: number; departureId?: number }
  | { type: "return"; allocation: DepartureSupplyAllocationView }
  | null;

function StockStatusBadge({ item }: { item: SupplyCatalogItemView }) {
  if (!item.isActive) {
    return (
      <span className="inline-block whitespace-nowrap rounded px-2 py-1 text-xs font-semibold bg-[#F5F5F5] text-[#616161]">
        Ngừng sử dụng
      </span>
    );
  }
  const health = stockHealthStatus(item);
  if (health === "out") {
    return (
      <span className="inline-block whitespace-nowrap rounded px-2 py-1 text-xs font-semibold bg-[#FFEBEE] text-[#C62828]">
        Hết tồn kho
      </span>
    );
  }
  if (health === "low") {
    return (
      <span className="inline-block whitespace-nowrap rounded px-2 py-1 text-xs font-semibold bg-[#FFF8E1] text-[#8A5A00]">
        Sắp hết ({item.currentStock}/{item.minStock})
      </span>
    );
  }
  return (
    <span className="inline-block whitespace-nowrap rounded px-2 py-1 text-xs font-semibold bg-[#E8F5E9] text-[#186734]">
      Đủ tồn kho
    </span>
  );
}

function MovementBadge({ type }: { type: "StockIn" | "IssueToDeparture" | "ReturnFromDeparture" }) {
  if (type === "StockIn") {
    return (
      <span className="inline-block whitespace-nowrap rounded px-2 py-1 text-xs font-semibold bg-[#E8F5E9] text-[#186734]">
        Nhập kho
      </span>
    );
  }
  if (type === "IssueToDeparture") {
    return (
      <span className="inline-block whitespace-nowrap rounded px-2 py-1 text-xs font-semibold bg-[#FFF8E1] text-[#8A5A00]">
        Cấp theo chuyến
      </span>
    );
  }
  return (
    <span className="inline-block whitespace-nowrap rounded px-2 py-1 text-xs font-semibold bg-[#F5F5F5] text-[#616161]">
      Hoàn nhập dư
    </span>
  );
}

function SupplyPhaseNotice({
  phase,
  portal,
  hasModal,
  onRetry,
}: {
  phase: SupplyWorkspacePhase;
  portal: "staff" | "leader";
  hasModal: boolean;
  onRetry: () => void;
}) {
  if (phase === "ready") return null;
  const callbackPath = portal === "leader" ? "/leader/supplies" : "/staff/supplies";

  if (phase === "auth-loading" || phase === "loading") {
    return (
      <p role="status" className="py-12 text-center text-sm text-[#5C636A]">
        {phase === "auth-loading"
          ? "Đang kiểm tra phiên đăng nhập…"
          : "Đang tải dữ liệu vật tư và sổ kho…"}
      </p>
    );
  }

  if (phase === "sign-in") {
    return (
      <div className="space-y-4 rounded-[6px] border border-[#E0E0E0] bg-white p-8 text-center">
        <p className="text-sm text-[#212529]">
          Vui lòng đăng nhập cổng nội bộ để xem thông tin vật tư và cấp phát theo chuyến.
        </p>
        <Link
          href={`/staff/login?callbackUrl=${encodeURIComponent(callbackPath)}`}
          className={hasModal ? secondaryButtonClass : primaryYellowButtonClass}
        >
          Đăng nhập nội bộ
        </Link>
      </div>
    );
  }

  if (phase === "forbidden") {
    return (
      <div
        role="alert"
        className="space-y-3 rounded-[6px] border border-[#E0E0E0] bg-white p-8 text-center"
      >
        <ShieldCheck aria-hidden="true" className="mx-auto size-8 text-[#5C636A]" />
        <h2 className="text-base font-bold text-[#212529]">
          Bạn không có quyền truy cập màn hình vật tư này
        </h2>
        <p className="mx-auto max-w-md text-sm leading-6 text-[#5C636A]">
          Quyền xem hoặc điều phối vật tư được phân tách theo vai trò vận hành. Vui lòng kiểm tra lại tài khoản đang đăng nhập.
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div
        role="alert"
        className="space-y-4 rounded-[6px] border border-[#E0E0E0] bg-white p-8 text-center"
      >
        <p className="text-sm font-semibold text-[#C62828]">
          Không thể tải dữ liệu kho vật tư lúc này. Số liệu cũ đã được ẩn để tránh nhầm lẫn khi cấp phát.
        </p>
        <button type="button" onClick={onRetry} className={secondaryButtonClass}>
          Thử tải lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[6px] border border-[#E0E0E0] bg-white p-8 text-center">
      <FileClock aria-hidden="true" className="mx-auto size-9 text-[#5C636A]" />
      <h2 className="text-base font-bold text-[#212529]">
        Dữ liệu kho vật tư chưa sẵn sàng
      </h2>
      <p className="mx-auto max-w-lg text-sm leading-6 text-[#5C636A]">
        Hệ thống chưa kết nối dịch vụ sổ kho và cấp phát vật tư theo chuyến tại thời điểm này. Màn hình không hiển thị số tồn kho mẫu để đảm bảo an toàn vận hành đoàn.
      </p>
      <div className="pt-2">
        <Link
          href={portal === "leader" ? "/leader" : "/staff"}
          className={secondaryButtonClass}
        >
          Quay về trang tổng quan
        </Link>
      </div>
    </div>
  );
}

export function SupplyWorkspace({
  portal = "staff",
  source,
}: {
  portal?: "staff" | "leader";
  source?: SupplyWorkspaceSource;
}) {
  const session = useSession();
  const scope = supplyReadScope(portal, session.status, session.data?.user);
  return (
    <SupplyWorkspaceInner
      key={`${portal}:${session.status}:${scope}`}
      portal={portal}
      source={source}
    />
  );
}

function SupplyWorkspaceInner({
  portal,
  source,
}: {
  portal: "staff" | "leader";
  source?: SupplyWorkspaceSource;
}) {
  const [queryParams, setQueryParams] = useState<{
    departureId: number | null;
    category: string;
    search: string;
  }>({
    departureId: null,
    category: "all",
    search: "",
  });

  const read = useSupplyWorkspace(portal, source, queryParams);
  const { capabilities, data } = read;

  const defaultTab: ActiveTab = capabilities.canReadCatalog ? "catalog" : "departures";
  const [activeTab, setActiveTab] = useState<ActiveTab>(defaultTab);
  const currentTab: ActiveTab = capabilities.canReadCatalog ? activeTab : "departures";

  const [searchDraft, setSearchDraft] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "attention" | "ok">("all");
  const [movementFilter, setMovementFilter] = useState<"all" | "StockIn" | "IssueToDeparture" | "ReturnFromDeparture">("all");
  const [departureFilter, setDepartureFilter] = useState<number | "all">("all");

  const [modal, setModal] = useState<ActiveModal>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Modal draft states
  const [catalogDraft, setCatalogDraft] = useState({
    sku: "",
    name: "",
    category: "Nước uống",
    unit: "chai",
    minStock: "20",
  });
  const [catalogErrors, setCatalogErrors] = useState<Record<string, string>>({});

  const [stockInDraft, setStockInDraft] = useState({
    itemId: 0,
    unit: "chai",
    quantity: "",
    note: "",
  });
  const [stockInErrors, setStockInErrors] = useState<Record<string, string>>({});

  const [issueDraft, setIssueDraft] = useState({
    departureId: 0,
    itemId: 0,
    unit: "chai",
    quantity: "",
    note: "",
  });
  const [issueErrors, setIssueErrors] = useState<Record<string, string>>({});
  const [issueShortage, setIssueShortage] = useState<StockShortageDetail | undefined>(undefined);

  const [returnDraft, setReturnDraft] = useState({
    allocationId: 0,
    unit: "chai",
    quantity: "",
    note: "",
  });
  const [returnErrors, setReturnErrors] = useState<Record<string, string>>({});
  const [returnExcess, setReturnExcess] = useState<ReturnExcessDetail | undefined>(undefined);

  const [mutationConflict, setMutationConflict] = useState<SupplyMutationErrorClassification | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasOpenModal = modal !== null;

  function openCatalogModal(item?: SupplyCatalogItemView) {
    setMutationConflict(null);
    setCatalogErrors({});
    setCatalogDraft({
      sku: item?.sku ?? "",
      name: item?.name ?? "",
      category: item?.category ?? "Nước uống",
      unit: item?.unit ?? "chai",
      minStock: String(item?.minStock ?? 20),
    });
    setModal({ type: "catalog", item });
  }

  function openStockInModal(itemId?: number) {
    setMutationConflict(null);
    setStockInErrors({});
    const target =
      data?.catalog.find((item) => item.id === itemId && item.isActive) ??
      data?.catalog.find((item) => item.isActive);
    setStockInDraft({
      itemId: target?.id ?? 0,
      unit: target?.unit ?? "chai",
      quantity: "",
      note: "",
    });
    setModal({ type: "stock-in", itemId: target?.id });
  }

  function openIssueModal(itemId?: number, departureId?: number) {
    setMutationConflict(null);
    setIssueErrors({});
    setIssueShortage(undefined);
    const targetItem =
      data?.catalog.find((item) => item.id === itemId && item.isActive) ??
      data?.catalog.find((item) => item.isActive);
    const targetDeparture =
      data?.departures.find((dep) => dep.departureId === departureId) ??
      data?.departures[0];
    setIssueDraft({
      departureId: targetDeparture?.departureId ?? 0,
      itemId: targetItem?.id ?? 0,
      unit: targetItem?.unit ?? "chai",
      quantity: "",
      note: "",
    });
    setModal({ type: "issue", itemId: targetItem?.id, departureId: targetDeparture?.departureId });
  }

  function openReturnModal(allocation: DepartureSupplyAllocationView) {
    setMutationConflict(null);
    setReturnErrors({});
    setReturnExcess(undefined);
    const remaining = remainingAllocatableReturn(allocation);
    setReturnDraft({
      allocationId: allocation.id,
      unit: allocation.unit,
      quantity: remaining > 0 ? String(remaining) : "",
      note: "",
    });
    setModal({ type: "return", allocation });
  }

  function closeModal() {
    if (submitting) return;
    setModal(null);
    setMutationConflict(null);
    setIssueShortage(undefined);
    setReturnExcess(undefined);
  }

  async function handleCatalogSubmit(event: FormEvent) {
    event.preventDefault();
    setMutationConflict(null);
    const result = validateCatalogItemDraft(catalogDraft);
    if (!result.valid) {
      setCatalogErrors(result.errors as Record<string, string>);
      return;
    }
    if (!source?.saveCatalogItem) {
      setMutationConflict({
        kind: "error",
        title: "Chưa kết nối thao tác lưu danh mục",
        message: "Chức năng lưu danh mục sẽ hoạt động ngay khi dịch vụ kho được kích hoạt.",
        shouldRefresh: false,
      });
      return;
    }
    setSubmitting(true);
    try {
      const editingItem = modal?.type === "catalog" ? modal.item : undefined;
      await source.saveCatalogItem({
        id: editingItem?.id,
        ...result.value,
        isActive: editingItem?.isActive ?? true,
      });
      setModal(null);
      setBannerMessage(`Đã lưu danh mục vật tư "${result.value.name}" (${result.value.sku}).`);
      read.refresh();
    } catch (error) {
      const classified = classifySupplyMutationError(error);
      setMutationConflict(classified);
      if (classified.shouldRefresh) read.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStockInSubmit(event: FormEvent) {
    event.preventDefault();
    setMutationConflict(null);
    const selectedItem = data?.catalog.find((item) => item.id === stockInDraft.itemId);
    const result = validateStockInDraft(stockInDraft, selectedItem);
    if (!result.valid) {
      setStockInErrors(result.errors as Record<string, string>);
      return;
    }
    if (!source?.recordStockIn) {
      setMutationConflict({
        kind: "error",
        title: "Chưa kết nối thao tác nhập kho",
        message: "Chức năng ghi sổ nhập kho sẽ hoạt động khi dịch vụ kho sẵn sàng.",
        shouldRefresh: false,
      });
      return;
    }
    setSubmitting(true);
    try {
      await source.recordStockIn(result.value);
      setModal(null);
      setBannerMessage(
        `Đã nhập kho +${result.value.quantity} ${result.value.unit} cho "${selectedItem?.name ?? ""}".`,
      );
      read.refresh();
    } catch (error) {
      const classified = classifySupplyMutationError(error);
      setMutationConflict(classified);
      if (classified.shouldRefresh) read.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleIssueSubmit(event: FormEvent) {
    event.preventDefault();
    setMutationConflict(null);
    const selectedItem = data?.catalog.find((item) => item.id === issueDraft.itemId);
    const result = validateDepartureIssueDraft(issueDraft, selectedItem);
    if (!result.valid) {
      setIssueErrors(result.errors as Record<string, string>);
      setIssueShortage(result.shortage);
      return;
    }
    setIssueShortage(undefined);
    if (!source?.issueToDeparture) {
      setMutationConflict({
        kind: "error",
        title: "Chưa kết nối thao tác cấp vật tư theo chuyến",
        message: "Chức năng xuất cấp vật tư theo chuyến sẽ hoạt động khi dịch vụ kho sẵn sàng.",
        shouldRefresh: false,
      });
      return;
    }
    setSubmitting(true);
    try {
      await source.issueToDeparture(result.value);
      setModal(null);
      setBannerMessage(
        `Đã cấp ${result.value.quantity} ${result.value.unit} "${selectedItem?.name ?? ""}" cho chuyến khởi hành.`,
      );
      read.refresh();
    } catch (error) {
      const classified = classifySupplyMutationError(error);
      setMutationConflict(classified);
      if (classified.shouldRefresh) read.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReturnSubmit(event: FormEvent) {
    event.preventDefault();
    setMutationConflict(null);
    const currentAllocation =
      modal?.type === "return"
        ? data?.allocations.find((entry) => entry.id === modal.allocation.id) ?? modal.allocation
        : undefined;
    const result = validateDepartureReturnDraft(returnDraft, currentAllocation);
    if (!result.valid) {
      setReturnErrors(result.errors as Record<string, string>);
      setReturnExcess(result.excess);
      return;
    }
    setReturnExcess(undefined);
    if (!source?.returnFromDeparture) {
      setMutationConflict({
        kind: "error",
        title: "Chưa kết nối thao tác hoàn nhập vật tư dư",
        message: "Chức năng hoàn nhập vật tư dư sẽ hoạt động khi dịch vụ kho sẵn sàng.",
        shouldRefresh: false,
      });
      return;
    }
    setSubmitting(true);
    try {
      await source.returnFromDeparture(result.value);
      setModal(null);
      setBannerMessage(
        `Đã hoàn nhập +${result.value.quantity} ${result.value.unit} "${currentAllocation?.itemName ?? ""}" về kho.`,
      );
      read.refresh();
    } catch (error) {
      const classified = classifySupplyMutationError(error);
      setMutationConflict(classified);
      if (classified.shouldRefresh) read.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const normalizedSearch = searchDraft.trim().toLowerCase();

  const filteredCatalog = (data?.catalog ?? []).filter((item) => {
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (stockFilter === "attention" && stockHealthStatus(item) === "ok") return false;
    if (stockFilter === "ok" && stockHealthStatus(item) !== "ok") return false;
    if (
      normalizedSearch &&
      !item.name.toLowerCase().includes(normalizedSearch) &&
      !item.sku.toLowerCase().includes(normalizedSearch)
    ) {
      return false;
    }
    return true;
  });

  const filteredLedger = (data?.ledger ?? []).filter((entry) => {
    if (movementFilter !== "all" && entry.movementType !== movementFilter) return false;
    if (departureFilter !== "all" && entry.departureId !== departureFilter) return false;
    if (
      normalizedSearch &&
      !entry.itemName.toLowerCase().includes(normalizedSearch) &&
      !entry.sku.toLowerCase().includes(normalizedSearch) &&
      !(entry.departureLabel ?? "").toLowerCase().includes(normalizedSearch)
    ) {
      return false;
    }
    return true;
  });

  const filteredAllocations = (data?.allocations ?? []).filter((allocation) => {
    if (departureFilter !== "all" && allocation.departureId !== departureFilter) return false;
    if (
      normalizedSearch &&
      !allocation.itemName.toLowerCase().includes(normalizedSearch) &&
      !allocation.sku.toLowerCase().includes(normalizedSearch) &&
      !allocation.departureLabel.toLowerCase().includes(normalizedSearch)
    ) {
      return false;
    }
    return true;
  });

  const totalActiveItems = (data?.catalog ?? []).filter((item) => item.isActive).length;
  const lowStockCount = (data?.catalog ?? []).filter(
    (item) => item.isActive && stockHealthStatus(item) === "low",
  ).length;
  const outOfStockCount = (data?.catalog ?? []).filter(
    (item) => item.isActive && stockHealthStatus(item) === "out",
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#186734]">
            {capabilities.canManageCatalog
              ? "Quản lý kho đoàn trekking"
              : "Tra cứu vật tư theo chuyến"}
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            {capabilities.canManageCatalog
              ? "Vật tư, tồn kho và cấp phát theo chuyến"
              : "Vật tư cấp theo chuyến"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5C636A]">
            {capabilities.scopeLabel}. Mọi số lượng nhập kho, xuất cấp cho đoàn và hoàn nhập vật tư dư đều kiểm tra đúng đơn vị tính và tồn thực tế.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!source || read.phase !== "ready"}
            onClick={() => {
              setBannerMessage(null);
              read.refresh();
            }}
            className={secondaryButtonClass}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Làm mới số liệu
          </button>

          {capabilities.canManageCatalog && read.phase === "ready" && (
            <>
              {currentTab === "catalog" && (
                <>
                  <button
                    type="button"
                    onClick={() => openCatalogModal()}
                    className={secondaryButtonClass}
                  >
                    Thêm danh mục vật tư
                  </button>
                  <button
                    type="button"
                    onClick={() => openStockInModal()}
                    className={hasOpenModal ? brandButtonClass : primaryYellowButtonClass}
                  >
                    <PackagePlus aria-hidden="true" className="size-4" />
                    Nhập kho vật tư
                  </button>
                </>
              )}
              {(currentTab === "ledger" || currentTab === "departures") && (
                <button
                  type="button"
                  onClick={() =>
                    openIssueModal(
                      undefined,
                      departureFilter !== "all" ? departureFilter : undefined,
                    )
                  }
                  className={hasOpenModal ? brandButtonClass : primaryYellowButtonClass}
                >
                  Cấp vật tư cho chuyến
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Role Scope Info Strip */}
      <p className="border-l-4 border-[#186734] bg-white p-4 text-sm leading-6 text-[#5C636A]">
        {capabilities.canManageCatalog
          ? "Chỉ nhân sự phụ trách nguồn lực và quản trị viên mới được thêm danh mục, ghi phiếu nhập kho, cấp vật tư cho chuyến hoặc hoàn nhập vật tư dư."
          : "Bạn đang xem ở chế độ tra cứu theo chuyến được giao. Nếu cần bổ sung hoặc điều chỉnh vật tư cho đoàn, vui lòng liên hệ bộ phận điều phối nhân sự và đội xe."}
      </p>

      {bannerMessage && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-[6px] border border-[#186734] bg-[#E8F5E9] px-4 py-3 text-sm font-semibold text-[#186734]"
        >
          <span>{bannerMessage}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="underline underline-offset-4"
          >
            Ẩn thông báo
          </button>
        </div>
      )}

      <SupplyPhaseNotice
        phase={read.phase}
        portal={portal}
        hasModal={hasOpenModal}
        onRetry={read.refresh}
      />

      {read.phase === "ready" && data && (
        <>
          {/* Summary metrics for HRMgr/Admin */}
          {capabilities.canReadCatalog && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-[6px] border border-[#E0E0E0] bg-white p-4">
                <p className="text-xs font-semibold text-[#5C636A]">
                  Mặt hàng đang hoạt động
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-[#212529]">
                  {totalActiveItems}
                </p>
              </div>
              <div className="rounded-[6px] border border-[#E0E0E0] bg-white p-4">
                <p className="text-xs font-semibold text-[#8A5A00]">
                  Mặt hàng chạm ngưỡng sắp hết
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-[#8A5A00]">
                  {lowStockCount}
                </p>
              </div>
              <div className="rounded-[6px] border border-[#E0E0E0] bg-white p-4">
                <p className="text-xs font-semibold text-[#C62828]">
                  Mặt hàng đã hết tồn kho
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-[#C62828]">
                  {outOfStockCount}
                </p>
              </div>
            </div>
          )}

          {/* Section Tabs for HRMgr / Admin */}
          {capabilities.canReadCatalog && (
            <div
              role="tablist"
              aria-label="Phân mục quản lý vật tư"
              className="flex flex-wrap gap-2 border-b border-neutral-300 pb-3"
            >
              {(
                [
                  ["catalog", "Danh mục & tồn kho"],
                  ["ledger", "Lịch sử nhập/xuất"],
                  ["departures", "Cấp & hoàn nhập theo chuyến"],
                ] as const
              ).map(([tabKey, label]) => {
                const selected = currentTab === tabKey;
                return (
                  <button
                    key={tabKey}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(tabKey)}
                    className={`min-h-11 rounded-[5px] px-4 text-sm font-semibold ${
                      selected
                        ? "bg-[#186734] text-white"
                        : "border border-[#6B7280] bg-white text-[#212529] hover:bg-neutral-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Filter Bar */}
          <div className="grid items-stretch gap-4 rounded-[6px] border border-[#E0E0E0] bg-white p-4 sm:grid-cols-3">
            <div className="flex min-w-0 flex-col justify-between gap-1.5">
              <label htmlFor="supply-search" className="text-sm font-semibold">
                Tìm theo tên, mã vật tư hoặc chuyến
              </label>
              <input
                id="supply-search"
                type="search"
                value={searchDraft}
                maxLength={100}
                placeholder="Ví dụ: NUOC-500ML, nước suối, Chứa Chan…"
                onChange={(event) => {
                  setSearchDraft(event.target.value);
                  setQueryParams((prev) => ({ ...prev, search: event.target.value.trim() }));
                }}
                className={`${controlClass} w-full`}
              />
            </div>

            {currentTab === "catalog" ? (
              <>
                <div className="flex min-w-0 flex-col justify-between gap-1.5">
                  <label htmlFor="supply-category-filter" className="text-sm font-semibold">
                    Nhóm vật tư
                  </label>
                  <select
                    id="supply-category-filter"
                    value={categoryFilter}
                    onChange={(event) => {
                      setCategoryFilter(event.target.value);
                      setQueryParams((prev) => ({ ...prev, category: event.target.value }));
                    }}
                    className={`${controlClass} w-full`}
                  >
                    <option value="all">Tất cả nhóm</option>
                    {SUPPLY_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex min-w-0 flex-col justify-between gap-1.5">
                  <label htmlFor="supply-stock-filter" className="text-sm font-semibold">
                    Tình trạng tồn kho
                  </label>
                  <select
                    id="supply-stock-filter"
                    value={stockFilter}
                    onChange={(event) =>
                      setStockFilter(event.target.value as "all" | "attention" | "ok")
                    }
                    className={`${controlClass} w-full`}
                  >
                    <option value="all">Tất cả tình trạng</option>
                    <option value="attention">Cần bổ sung (sắp hết / hết hàng)</option>
                    <option value="ok">Đủ tồn kho</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="flex min-w-0 flex-col justify-between gap-1.5">
                  <label htmlFor="supply-departure-filter" className="text-sm font-semibold">
                    Chuyến khởi hành
                  </label>
                  <select
                    id="supply-departure-filter"
                    value={departureFilter === "all" ? "all" : String(departureFilter)}
                    onChange={(event) => {
                      const next =
                        event.target.value === "all" ? "all" : Number(event.target.value);
                      setDepartureFilter(next);
                      setQueryParams((prev) => ({
                        ...prev,
                        departureId: next === "all" ? null : next,
                      }));
                    }}
                    className={`${controlClass} w-full`}
                  >
                    <option value="all">Tất cả chuyến</option>
                    {data.departures.map((dep) => (
                      <option key={dep.departureId} value={String(dep.departureId)}>
                        #{dep.departureId} · {dep.tripName} ({formatVietnamDateTime(dep.departureAt, dateOptions)})
                      </option>
                    ))}
                  </select>
                </div>

                {currentTab === "ledger" ? (
                  <div className="flex min-w-0 flex-col justify-between gap-1.5">
                    <label htmlFor="supply-movement-filter" className="text-sm font-semibold">
                      Loại biến động kho
                    </label>
                    <select
                      id="supply-movement-filter"
                      value={movementFilter}
                      onChange={(event) =>
                        setMovementFilter(
                          event.target.value as
                            | "all"
                            | "StockIn"
                            | "IssueToDeparture"
                            | "ReturnFromDeparture",
                        )
                      }
                      className={`${controlClass} w-full`}
                    >
                      <option value="all">Tất cả biến động</option>
                      <option value="StockIn">Nhập kho</option>
                      <option value="IssueToDeparture">Cấp theo chuyến</option>
                      <option value="ReturnFromDeparture">Hoàn nhập dư</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex items-end">
                    <p className="text-xs leading-5 text-[#5C636A]">
                      Hiển thị {filteredAllocations.length} khoản cấp vật tư theo bộ lọc hiện tại.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* TAB 1: DANH MỤC & TỒN KHO */}
          {currentTab === "catalog" && capabilities.canReadCatalog && (
            <section aria-label="Danh mục và tồn kho vật tư" className="space-y-4">
              {filteredCatalog.length > 0 ? (
                <div
                  role="region"
                  aria-label="Bảng danh mục và tồn kho vật tư"
                  tabIndex={0}
                  className="relative overflow-x-auto rounded-[6px] border border-[#E0E0E0] bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <caption className="sr-only">
                      Danh mục vật tư, đơn vị tính, số lượng tồn hiện tại và trạng thái cảnh báo tồn kho
                    </caption>
                    <thead className="border-b border-[#E0E0E0] bg-[#F8F9FA] text-left">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Mã vật tư
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Tên vật tư
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Nhóm
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Đơn vị
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">
                          Tồn hiện tại
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">
                          Ngưỡng tối thiểu
                        </th>
                        <th scope="col" className="px-4 py-3 text-center font-semibold">
                          Trạng thái
                        </th>
                        {capabilities.canManageCatalog && (
                          <th scope="col" className="px-4 py-3 text-right font-semibold">
                            Thao tác
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E0E0E0]">
                      {filteredCatalog.map((item) => (
                        <tr key={item.id}>
                          <th scope="row" className="px-4 py-3 text-left font-mono font-semibold">
                            {item.sku}
                          </th>
                          <td className="px-4 py-3 font-medium">{item.name}</td>
                          <td className="px-4 py-3 text-[#5C636A]">{item.category}</td>
                          <td className="px-4 py-3">{item.unit}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">
                            {item.currentStock}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[#5C636A]">
                            {item.minStock}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StockStatusBadge item={item} />
                          </td>
                          {capabilities.canManageCatalog && (
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex flex-wrap justify-end gap-3">
                                <button
                                  type="button"
                                  disabled={!item.isActive}
                                  onClick={() => openStockInModal(item.id)}
                                  className="min-h-11 font-semibold text-[#186734] underline underline-offset-4 disabled:text-[#5C636A] disabled:no-underline"
                                >
                                  Nhập thêm
                                </button>
                                <button
                                  type="button"
                                  disabled={!item.isActive || item.currentStock <= 0}
                                  onClick={() => openIssueModal(item.id)}
                                  className="min-h-11 font-semibold text-[#212529] underline underline-offset-4 disabled:text-[#5C636A] disabled:no-underline"
                                >
                                  Cấp cho chuyến
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openCatalogModal(item)}
                                  className="min-h-11 font-semibold text-[#5C636A] underline underline-offset-4"
                                >
                                  Sửa
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-3 rounded-[6px] border border-[#E0E0E0] bg-white py-10 text-center">
                  <Boxes aria-hidden="true" className="mx-auto size-9 text-[#5C636A]" />
                  <h2 className="font-bold">Không tìm thấy vật tư khớp bộ lọc</h2>
                  <p className="text-sm text-[#5C636A]">
                    Bạn có thể đổi nhóm vật tư, xóa từ khóa tìm kiếm hoặc thêm mặt hàng mới vào danh mục kho.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* TAB 2: LỊCH SỬ NHẬP/XUẤT */}
          {currentTab === "ledger" && capabilities.canReadCatalog && (
            <section aria-label="Sổ lịch sử nhập xuất vật tư" className="space-y-4">
              {filteredLedger.length > 0 ? (
                <div
                  role="region"
                  aria-label="Bảng lịch sử nhập xuất kho"
                  tabIndex={0}
                  className="relative overflow-x-auto rounded-[6px] border border-[#E0E0E0] bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <table className="w-full min-w-[740px] border-collapse text-sm">
                    <caption className="sr-only">
                      Lịch sử các giao dịch nhập kho, cấp phát theo chuyến và hoàn nhập vật tư dư
                    </caption>
                    <thead className="border-b border-[#E0E0E0] bg-[#F8F9FA] text-left">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Thời điểm
                        </th>
                        <th scope="col" className="px-4 py-3 text-center font-semibold">
                          Loại biến động
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Vật tư
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">
                          Số lượng biến động
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">
                          Tồn sau giao dịch
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Chuyến / Ghi chú
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Người thực hiện
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E0E0E0]">
                      {filteredLedger.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-[#5C636A]">
                            {formatVietnamDateTime(entry.recordedAt, dateOptions)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <MovementBadge type={entry.movementType} />
                          </td>
                          <th scope="row" className="px-4 py-3 text-left font-normal">
                            <p className="font-semibold">{entry.itemName}</p>
                            <p className="font-mono text-xs text-[#5C636A]">{entry.sku}</p>
                          </th>
                          <td
                            className={`px-4 py-3 text-right font-mono font-semibold whitespace-nowrap ${
                              entry.quantityDelta >= 0 ? "text-[#186734]" : "text-[#8A5A00]"
                            }`}
                          >
                            {entry.quantityDelta >= 0
                              ? `+${entry.quantityDelta}`
                              : String(entry.quantityDelta)}{" "}
                            {entry.unit}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold whitespace-nowrap">
                            {entry.balanceAfter} {entry.unit}
                          </td>
                          <td className="px-4 py-3">
                            {entry.departureLabel && (
                              <p className="font-semibold text-[#212529]">{entry.departureLabel}</p>
                            )}
                            <p className="text-xs text-[#5C636A]">{entry.note}</p>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-[#212529]">
                            {entry.actorName}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-3 rounded-[6px] border border-[#E0E0E0] bg-white py-10 text-center">
                  <Boxes aria-hidden="true" className="mx-auto size-9 text-[#5C636A]" />
                  <h2 className="font-bold">Chưa có lịch sử nhập/xuất khớp bộ lọc</h2>
                  <p className="text-sm text-[#5C636A]">
                    Hãy thử chọn tất cả loại biến động hoặc kiểm tra chuyến khởi hành khác.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* TAB 3 / READ-ONLY VIEW: CẤP & HOÀN NHẬP THEO CHUYẾN */}
          {currentTab === "departures" && capabilities.canReadDepartureSupplies && (
            <section aria-label="Danh sách vật tư cấp theo chuyến" className="space-y-4">
              {filteredAllocations.length > 0 ? (
                <div
                  role="region"
                  aria-label="Bảng vật tư cấp theo chuyến"
                  tabIndex={0}
                  className="relative overflow-x-auto rounded-[6px] border border-[#E0E0E0] bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <table className="w-full min-w-[740px] border-collapse text-sm">
                    <caption className="sr-only">
                      Danh sách vật tư đã cấp cho từng chuyến khởi hành và số lượng hoàn nhập dư
                    </caption>
                    <thead className="border-b border-[#E0E0E0] bg-[#F8F9FA] text-left">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Chuyến khởi hành
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Vật tư
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Đơn vị
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">
                          Đã cấp
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">
                          Đã hoàn nhập
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">
                          Còn giữ trên chuyến
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold">
                          Người cấp & thời điểm
                        </th>
                        {capabilities.canIssueAndReturn && (
                          <th scope="col" className="px-4 py-3 text-right font-semibold">
                            Thao tác
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E0E0E0]">
                      {filteredAllocations.map((allocation) => {
                        const remaining = remainingAllocatableReturn(allocation);
                        return (
                          <tr key={allocation.id}>
                            <td className="px-4 py-3">
                              <p className="font-semibold">{allocation.departureLabel}</p>
                              {allocation.note && (
                                <p className="mt-0.5 text-xs text-[#5C636A]">{allocation.note}</p>
                              )}
                            </td>
                            <th scope="row" className="px-4 py-3 text-left font-normal">
                              <p className="font-semibold">{allocation.itemName}</p>
                              <p className="font-mono text-xs text-[#5C636A]">{allocation.sku}</p>
                            </th>
                            <td className="px-4 py-3">{allocation.unit}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold">
                              {allocation.issuedQuantity}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-[#5C636A]">
                              {allocation.returnedQuantity}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-[#186734]">
                              {remaining}
                            </td>
                            <td className="px-4 py-3 text-xs text-[#5C636A]">
                              <p className="font-medium text-[#212529]">{allocation.actorName}</p>
                              <p>{formatVietnamDateTime(allocation.issuedAt, dateOptions)}</p>
                            </td>
                            {capabilities.canIssueAndReturn && (
                              <td className="px-4 py-3 text-right">
                                {remaining > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => openReturnModal(allocation)}
                                    className="min-h-11 whitespace-nowrap font-semibold text-[#186734] underline underline-offset-4"
                                  >
                                    Hoàn nhập vật tư dư
                                  </button>
                                ) : (
                                  <span className="text-xs text-[#5C636A]">Đã hoàn nhập hết</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-3 rounded-[6px] border border-[#E0E0E0] bg-white py-10 text-center">
                  <Boxes aria-hidden="true" className="mx-auto size-9 text-[#5C636A]" />
                  <h2 className="font-bold">Chưa có vật tư cấp cho chuyến khớp bộ lọc</h2>
                  <p className="text-sm text-[#5C636A]">
                    {capabilities.canIssueAndReturn
                      ? "Bạn có thể chọn chuyến khác hoặc bấm Cấp vật tư cho chuyến để tạo phiếu xuất cấp mới."
                      : "Khi bộ phận điều phối cấp vật tư cho chuyến của bạn, danh sách chi tiết sẽ hiển thị tại đây."}
                  </p>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* MODAL 1: THÊM / SỬA DANH MỤC VẬT TƯ */}
      {modal?.type === "catalog" && (
        <SupplyActionDialog
          title={modal.item ? "Cập nhật danh mục vật tư" : "Thêm danh mục vật tư mới"}
          onClose={closeModal}
        >
          <form onSubmit={handleCatalogSubmit} noValidate className="space-y-4">
            {mutationConflict && (
              <div
                role="alert"
                className="rounded-[6px] border border-[#C62828] bg-[#FFEBEE] p-3 text-sm text-[#C62828]"
              >
                <p className="font-bold">{mutationConflict.title}</p>
                <p className="mt-1">{mutationConflict.message}</p>
              </div>
            )}

            <div>
              <label htmlFor="catalog-sku" className="text-sm font-semibold">
                Mã vật tư
              </label>
              <input
                id="catalog-sku"
                value={catalogDraft.sku}
                onChange={(e) => setCatalogDraft((prev) => ({ ...prev, sku: e.target.value }))}
                placeholder="Ví dụ: NUOC-500ML"
                className={`${controlClass} mt-1 w-full font-mono uppercase`}
              />
              {catalogErrors.sku && (
                <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                  {catalogErrors.sku}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="catalog-name" className="text-sm font-semibold">
                Tên vật tư
              </label>
              <input
                id="catalog-name"
                value={catalogDraft.name}
                onChange={(e) => setCatalogDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ví dụ: Nước suối đóng chai 500ml"
                className={`${controlClass} mt-1 w-full`}
              />
              {catalogErrors.name && (
                <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                  {catalogErrors.name}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="catalog-category" className="text-sm font-semibold">
                  Nhóm vật tư
                </label>
                <select
                  id="catalog-category"
                  value={catalogDraft.category}
                  onChange={(e) =>
                    setCatalogDraft((prev) => ({ ...prev, category: e.target.value }))
                  }
                  className={`${controlClass} mt-1 w-full`}
                >
                  {SUPPLY_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                {catalogErrors.category && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                    {catalogErrors.category}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="catalog-unit" className="text-sm font-semibold">
                  Đơn vị tính chuẩn
                </label>
                <select
                  id="catalog-unit"
                  value={catalogDraft.unit}
                  onChange={(e) => setCatalogDraft((prev) => ({ ...prev, unit: e.target.value }))}
                  className={`${controlClass} mt-1 w-full`}
                >
                  {SUPPLY_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                {catalogErrors.unit && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                    {catalogErrors.unit}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="catalog-min-stock" className="text-sm font-semibold">
                Ngưỡng cảnh báo tồn tối thiểu
              </label>
              <input
                id="catalog-min-stock"
                type="number"
                min={0}
                max={100000}
                value={catalogDraft.minStock}
                onChange={(e) =>
                  setCatalogDraft((prev) => ({ ...prev, minStock: e.target.value }))
                }
                className={`${controlClass} mt-1 w-full font-mono`}
              />
              {catalogErrors.minStock && (
                <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                  {catalogErrors.minStock}
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal} className={secondaryButtonClass}>
                Hủy thao tác
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={primaryYellowButtonClass}
              >
                {submitting ? "Đang lưu…" : "Lưu danh mục vật tư"}
              </button>
            </div>
          </form>
        </SupplyActionDialog>
      )}

      {/* MODAL 2: NHẬP KHO VẬT TƯ */}
      {modal?.type === "stock-in" && (
        <SupplyActionDialog title="Nhập kho vật tư" onClose={closeModal}>
          <form onSubmit={handleStockInSubmit} noValidate className="space-y-4">
            {mutationConflict && (
              <div
                role="alert"
                className="rounded-[6px] border border-[#C62828] bg-[#FFEBEE] p-3 text-sm text-[#C62828]"
              >
                <p className="font-bold">{mutationConflict.title}</p>
                <p className="mt-1">{mutationConflict.message}</p>
              </div>
            )}

            <div>
              <label htmlFor="stockin-item" className="text-sm font-semibold">
                Vật tư nhập kho
              </label>
              <select
                id="stockin-item"
                value={String(stockInDraft.itemId)}
                onChange={(e) => {
                  const nextId = Number(e.target.value);
                  const found = data?.catalog.find((item) => item.id === nextId);
                  setStockInDraft((prev) => ({
                    ...prev,
                    itemId: nextId,
                    unit: found?.unit ?? prev.unit,
                  }));
                }}
                className={`${controlClass} mt-1 w-full`}
              >
                <option value="0">-- Chọn vật tư --</option>
                {(data?.catalog ?? []).map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.sku} · {item.name} (Tồn: {item.currentStock} {item.unit})
                  </option>
                ))}
              </select>
              {stockInErrors.itemId && (
                <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                  {stockInErrors.itemId}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="stockin-quantity" className="text-sm font-semibold">
                  Số lượng nhập
                </label>
                <input
                  id="stockin-quantity"
                  type="number"
                  min={1}
                  max={100000}
                  value={stockInDraft.quantity}
                  onChange={(e) =>
                    setStockInDraft((prev) => ({ ...prev, quantity: e.target.value }))
                  }
                  placeholder="Nhập số nguyên dương"
                  className={`${controlClass} mt-1 w-full font-mono`}
                />
                {stockInErrors.quantity && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                    {stockInErrors.quantity}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="stockin-unit" className="text-sm font-semibold">
                  Đơn vị tính xác nhận
                </label>
                <select
                  id="stockin-unit"
                  value={stockInDraft.unit}
                  onChange={(e) => setStockInDraft((prev) => ({ ...prev, unit: e.target.value }))}
                  className={`${controlClass} mt-1 w-full`}
                >
                  {SUPPLY_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                {stockInErrors.unit && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                    {stockInErrors.unit}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="stockin-note" className="text-sm font-semibold">
                Nguồn nhập / ghi chú phiếu nhập
              </label>
              <input
                id="stockin-note"
                value={stockInDraft.note}
                onChange={(e) => setStockInDraft((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Ví dụ: Nhập bổ sung vật tư cuối tuần đợt 2"
                className={`${controlClass} mt-1 w-full`}
              />
              {stockInErrors.note && (
                <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                  {stockInErrors.note}
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal} className={secondaryButtonClass}>
                Hủy thao tác
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={primaryYellowButtonClass}
              >
                {submitting ? "Đang ghi nhận…" : "Xác nhận nhập kho"}
              </button>
            </div>
          </form>
        </SupplyActionDialog>
      )}

      {/* MODAL 3: CẤP VẬT TƯ CHO CHUYẾN */}
      {modal?.type === "issue" && (
        <SupplyActionDialog title="Cấp vật tư theo chuyến khởi hành" onClose={closeModal}>
          <form onSubmit={handleIssueSubmit} noValidate className="space-y-4">
            {mutationConflict && (
              <div
                role="alert"
                className="rounded-[6px] border border-[#C62828] bg-[#FFEBEE] p-3 text-sm text-[#C62828]"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-bold">{mutationConflict.title}</p>
                    <p className="mt-1">{mutationConflict.message}</p>
                  </div>
                </div>
              </div>
            )}

            {issueShortage && (
              <div
                role="alert"
                className="rounded-[6px] border border-[#C62828] bg-[#FFEBEE] p-3 text-sm text-[#C62828]"
              >
                <p className="font-bold">Cảnh báo thiếu tồn kho để cấp phát</p>
                <p className="mt-1">
                  Tồn hiện có:{" "}
                  <span className="font-mono font-bold">
                    {issueShortage.available} {issueShortage.unit}
                  </span>{" "}
                  · Yêu cầu cấp:{" "}
                  <span className="font-mono font-bold">
                    {issueShortage.requested} {issueShortage.unit}
                  </span>{" "}
                  · Số lượng thiếu:{" "}
                  <span className="font-mono font-bold">
                    {issueShortage.deficit} {issueShortage.unit}
                  </span>
                  .
                </p>
              </div>
            )}

            <div>
              <label htmlFor="issue-departure" className="text-sm font-semibold">
                Chuyến khởi hành nhận vật tư
              </label>
              <select
                id="issue-departure"
                value={String(issueDraft.departureId)}
                onChange={(e) =>
                  setIssueDraft((prev) => ({ ...prev, departureId: Number(e.target.value) }))
                }
                className={`${controlClass} mt-1 w-full`}
              >
                <option value="0">-- Chọn chuyến khởi hành --</option>
                {(data?.departures ?? []).map((dep) => (
                  <option key={dep.departureId} value={String(dep.departureId)}>
                    #{dep.departureId} · {dep.tripName} ({formatVietnamDateTime(dep.departureAt, dateOptions)})
                  </option>
                ))}
              </select>
              {issueErrors.departureId && (
                <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                  {issueErrors.departureId}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="issue-item" className="text-sm font-semibold">
                Vật tư xuất cấp
              </label>
              <select
                id="issue-item"
                value={String(issueDraft.itemId)}
                onChange={(e) => {
                  const nextId = Number(e.target.value);
                  const found = data?.catalog.find((item) => item.id === nextId);
                  setIssueShortage(undefined);
                  setIssueDraft((prev) => ({
                    ...prev,
                    itemId: nextId,
                    unit: found?.unit ?? prev.unit,
                  }));
                }}
                className={`${controlClass} mt-1 w-full`}
              >
                <option value="0">-- Chọn vật tư --</option>
                {(data?.catalog ?? []).map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.sku} · {item.name} (Tồn khả dụng: {item.currentStock} {item.unit})
                  </option>
                ))}
              </select>
              {issueErrors.itemId && (
                <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                  {issueErrors.itemId}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="issue-quantity" className="text-sm font-semibold">
                  Số lượng cấp
                </label>
                <input
                  id="issue-quantity"
                  type="number"
                  min={1}
                  max={100000}
                  value={issueDraft.quantity}
                  onChange={(e) => {
                    setIssueShortage(undefined);
                    setIssueDraft((prev) => ({ ...prev, quantity: e.target.value }));
                  }}
                  placeholder="Nhập số nguyên dương"
                  className={`${controlClass} mt-1 w-full font-mono`}
                />
                {issueErrors.quantity && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                    {issueErrors.quantity}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="issue-unit" className="text-sm font-semibold">
                  Đơn vị tính xác nhận
                </label>
                <select
                  id="issue-unit"
                  value={issueDraft.unit}
                  onChange={(e) => setIssueDraft((prev) => ({ ...prev, unit: e.target.value }))}
                  className={`${controlClass} mt-1 w-full`}
                >
                  {SUPPLY_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                {issueErrors.unit && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                    {issueErrors.unit}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="issue-note" className="text-sm font-semibold">
                Ghi chú bàn giao cho đoàn
              </label>
              <input
                id="issue-note"
                value={issueDraft.note}
                onChange={(e) => setIssueDraft((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Ví dụ: Bàn giao đủ cơ số cho Leader dẫn đoàn"
                className={`${controlClass} mt-1 w-full`}
              />
              {issueErrors.note && (
                <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                  {issueErrors.note}
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal} className={secondaryButtonClass}>
                Hủy thao tác
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={primaryYellowButtonClass}
              >
                {submitting ? "Đang xuất cấp…" : "Xác nhận cấp vật tư"}
              </button>
            </div>
          </form>
        </SupplyActionDialog>
      )}

      {/* MODAL 4: HOÀN NHẬP VẬT TƯ DƯ */}
      {modal?.type === "return" && (
        <SupplyActionDialog title="Hoàn nhập vật tư dư sau chuyến" onClose={closeModal}>
          <form onSubmit={handleReturnSubmit} noValidate className="space-y-4">
            {mutationConflict && (
              <div
                role="alert"
                className="rounded-[6px] border border-[#C62828] bg-[#FFEBEE] p-3 text-sm text-[#C62828]"
              >
                <p className="font-bold">{mutationConflict.title}</p>
                <p className="mt-1">{mutationConflict.message}</p>
              </div>
            )}

            {returnExcess && (
              <div
                role="alert"
                className="rounded-[6px] border border-[#C62828] bg-[#FFEBEE] p-3 text-sm text-[#C62828]"
              >
                <p className="font-bold">Vượt quá số lượng vật tư còn giữ trên chuyến</p>
                <p className="mt-1">
                  Số lượng còn lại có thể hoàn nhập:{" "}
                  <span className="font-mono font-bold">
                    {returnExcess.remainingIssued} {returnExcess.unit}
                  </span>{" "}
                  · Yêu cầu hoàn nhập:{" "}
                  <span className="font-mono font-bold">
                    {returnExcess.requested} {returnExcess.unit}
                  </span>
                  .
                </p>
              </div>
            )}

            <dl className="divide-y divide-[#E0E0E0] border-y border-[#E0E0E0] py-2 text-sm">
              <div className="flex justify-between gap-2 py-2">
                <dt className="text-[#5C636A]">Chuyến khởi hành</dt>
                <dd className="font-semibold text-right">{modal.allocation.departureLabel}</dd>
              </div>
              <div className="flex justify-between gap-2 py-2">
                <dt className="text-[#5C636A]">Vật tư đã cấp</dt>
                <dd className="font-semibold text-right">
                  {modal.allocation.itemName} ({modal.allocation.sku})
                </dd>
              </div>
              <div className="flex justify-between gap-2 py-2">
                <dt className="text-[#5C636A]">Đã cấp / Đã hoàn nhập trước đó</dt>
                <dd className="font-mono font-semibold">
                  {modal.allocation.issuedQuantity} / {modal.allocation.returnedQuantity}{" "}
                  {modal.allocation.unit}
                </dd>
              </div>
              <div className="flex justify-between gap-2 py-2">
                <dt className="text-[#5C636A]">Tối đa có thể hoàn nhập</dt>
                <dd className="font-mono font-bold text-[#186734]">
                  {remainingAllocatableReturn(modal.allocation)} {modal.allocation.unit}
                </dd>
              </div>
            </dl>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="return-quantity" className="text-sm font-semibold">
                  Số lượng hoàn nhập dư
                </label>
                <input
                  id="return-quantity"
                  type="number"
                  min={1}
                  max={remainingAllocatableReturn(modal.allocation)}
                  value={returnDraft.quantity}
                  onChange={(e) => {
                    setReturnExcess(undefined);
                    setReturnDraft((prev) => ({ ...prev, quantity: e.target.value }));
                  }}
                  className={`${controlClass} mt-1 w-full font-mono`}
                />
                {returnErrors.quantity && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                    {returnErrors.quantity}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="return-unit" className="text-sm font-semibold">
                  Đơn vị tính xác nhận
                </label>
                <select
                  id="return-unit"
                  value={returnDraft.unit}
                  onChange={(e) => setReturnDraft((prev) => ({ ...prev, unit: e.target.value }))}
                  className={`${controlClass} mt-1 w-full`}
                >
                  {SUPPLY_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                {returnErrors.unit && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                    {returnErrors.unit}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="return-note" className="text-sm font-semibold">
                Tình trạng vật tư hoàn nhập
              </label>
              <input
                id="return-note"
                value={returnDraft.note}
                onChange={(e) => setReturnDraft((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Ví dụ: Còn nguyên tem niêm phong, nhập lại kho sau chuyến"
                className={`${controlClass} mt-1 w-full`}
              />
              {returnErrors.note && (
                <p role="alert" className="mt-1 text-xs font-semibold text-[#C62828]">
                  {returnErrors.note}
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal} className={secondaryButtonClass}>
                Hủy thao tác
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={primaryYellowButtonClass}
              >
                {submitting ? "Đang hoàn nhập…" : "Xác nhận hoàn nhập kho"}
              </button>
            </div>
          </form>
        </SupplyActionDialog>
      )}
    </div>
  );
}
