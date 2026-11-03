"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import Link from "next/link";
import type { Role } from "@/schemas/auth";
import type {
  TripSummaryDto,
  PickupDto,
  TripInput,
  TripPatch,
  Page,
} from "@/schemas/catalog";
import {
  fetchStaffTrips,
  createStaffTrip,
  updateStaffTrip,
  retireStaffTrip,
  fetchStaffPickupsPage,
  createStaffPickup,
  updateStaffPickup,
  retireStaffPickup,
  formatVnd,
} from "@/lib/catalog-client";
import {
  Plus,
  Edit,
  EyeOff,
  Eye,
  Bus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";

interface StaffCatalogManagerProps {
  actorRole: Role;
}

export function StaffCatalogManager({ actorRole }: StaffCatalogManagerProps) {
  const isManager = actorRole === "RouteMgr" || actorRole === "Admin";

  // Trips state
  const [trips, setTrips] = useState<TripSummaryDto[]>([]);
  const [tripPage, setTripPage] = useState(1);
  const [tripPageSize] = useState(20);
  const [tripPagination, setTripPagination] = useState<Page<TripSummaryDto>["pagination"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripSummaryDto | null>(null);

  // Pickups Drawer state (F01, F02, F03, F04, R1, R2, R3)
  const [selectedTripPickups, setSelectedTripPickups] = useState<TripSummaryDto | null>(null);
  const activePickupTripIdRef = useRef<number | null>(null);
  const drawerSessionRef = useRef<number>(0);
  const pickupRequestIdRef = useRef<number>(0);
  const pickupMutationIdRef = useRef<number>(0);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const pickupsDialogRef = useRef<HTMLDivElement | null>(null);
  const pickupsCloseBtnRef = useRef<HTMLButtonElement | null>(null);

  const [pickups, setPickups] = useState<PickupDto[]>([]);
  const [pickupPage, setPickupPage] = useState(1);
  const [pickupPagination, setPickupPagination] = useState<Page<PickupDto>["pagination"] | null>(null);
  const [loadingPickups, setLoadingPickups] = useState(false);
  const [pickupFetchError, setPickupFetchError] = useState<string | null>(null);
  const [pickupActionError, setPickupActionError] = useState<string | null>(null);
  const [pickupActionSuccess, setPickupActionSuccess] = useState<string | null>(null);

  // New pickup form
  const [newPickupName, setNewPickupName] = useState("");
  const [newPickupAddress, setNewPickupAddress] = useState("");
  const [submittingPickup, setSubmittingPickup] = useState(false);

  // Edit pickup state (F04)
  const [editingPickupId, setEditingPickupId] = useState<number | null>(null);
  const [editPickupName, setEditPickupName] = useState("");
  const [editPickupAddress, setEditPickupAddress] = useState("");

  const [isPending, startTransition] = useTransition();

  // Load trips with pagination (F03)
  const loadTrips = (pageToLoad: number = tripPage) => {
    setLoading(true);
    setActionError(null);
    fetchStaffTrips({ page: pageToLoad, pageSize: tripPageSize })
      .then((data) => {
        setTrips(data.items);
        setTripPagination(data.pagination);
        setTripPage(data.pagination.page);
      })
      .catch((err) => {
        setActionError(err instanceof Error ? err.message : "Lỗi tải danh mục tuyến");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isManager) {
      const timer = setTimeout(() => {
        loadTrips(1);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isManager]);

  const handleClosePickups = () => {
    // R1 & R2: Invalidate all in-flight GETs and mutations
    drawerSessionRef.current++;
    pickupRequestIdRef.current++;
    pickupMutationIdRef.current++;
    activePickupTripIdRef.current = null;
    setSelectedTripPickups(null);
    setPickups([]);
    setLoadingPickups(false);
    setSubmittingPickup(false);
    setPickupFetchError(null);
    setPickupActionError(null);
    setPickupActionSuccess(null);
    setEditingPickupId(null);
    setNewPickupName("");
    setNewPickupAddress("");

    // R3: Restore focus to trigger element
    if (lastTriggerRef.current && typeof lastTriggerRef.current.focus === "function") {
      lastTriggerRef.current.focus();
    }
    lastTriggerRef.current = null;
  };

  // R3: Lock body scroll when modal/drawer is open
  useEffect(() => {
    if (selectedTripPickups || showCreateModal || editingTrip) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [selectedTripPickups, showCreateModal, editingTrip]);

  // R3: Focus management, containment, and Tab trap for pickups drawer
  useEffect(() => {
    if (!selectedTripPickups) return;

    // Focus close button inside pickups drawer when opened
    pickupsCloseBtnRef.current?.focus();

    const handleDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const dialog = pickupsDialogRef.current;
        if (!dialog) return;

        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];

        // If focus escaped the dialog (e.g. dropped to BODY when a button was disabled)
        if (!dialog.contains(document.activeElement)) {
          e.preventDefault();
          if (e.shiftKey) {
            lastEl.focus();
          } else {
            firstEl.focus();
          }
          return;
        }

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [selectedTripPickups]);

  // Handle global Escape key to close open modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedTripPickups) handleClosePickups();
        else if (editingTrip) {
          setEditingTrip(null);
          lastTriggerRef.current?.focus();
          lastTriggerRef.current = null;
        } else if (showCreateModal) {
          setShowCreateModal(false);
          lastTriggerRef.current?.focus();
          lastTriggerRef.current = null;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTripPickups, editingTrip, showCreateModal]);

  const handleToggleTripActive = (trip: TripSummaryDto) => {
    setActionError(null);
    setSuccessMsg(null);

    startTransition(async () => {
      try {
        if (trip.is_active) {
          await retireStaffTrip(trip.trip_id);
          setSuccessMsg(`Đã tạm ẩn tuyến "${trip.name}" thành công.`);
        } else {
          await updateStaffTrip(trip.trip_id, { is_active: true });
          setSuccessMsg(`Đã kích hoạt lại tuyến "${trip.name}" thành công.`);
        }
        loadTrips(tripPage);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Thao tác không thành công.");
      }
    });
  };

  // F01 & R1: Load pickups safely, avoiding stale data, same-trip reopen, and out-of-order race conditions
  const loadPickupsForTrip = (
    tripId: number,
    pageToLoad: number = 1,
    expectedSession?: number
  ) => {
    const currentSession = expectedSession ?? drawerSessionRef.current;
    const reqId = ++pickupRequestIdRef.current;
    setLoadingPickups(true);
    setPickupFetchError(null);

    fetchStaffPickupsPage(tripId, { page: pageToLoad, pageSize: 20 })
      .then((pageData) => {
        if (
          drawerSessionRef.current === currentSession &&
          activePickupTripIdRef.current === tripId &&
          pickupRequestIdRef.current === reqId
        ) {
          setPickups(pageData.items);
          setPickupPagination(pageData.pagination);
          setPickupPage(pageData.pagination.page);
        }
      })
      .catch((err) => {
        if (
          drawerSessionRef.current === currentSession &&
          activePickupTripIdRef.current === tripId &&
          pickupRequestIdRef.current === reqId
        ) {
          setPickupFetchError(err instanceof Error ? err.message : "Lỗi tải điểm đón");
        }
      })
      .finally(() => {
        if (
          drawerSessionRef.current === currentSession &&
          activePickupTripIdRef.current === tripId &&
          pickupRequestIdRef.current === reqId
        ) {
          setLoadingPickups(false);
        }
      });
  };

  const handleOpenPickups = (trip: TripSummaryDto) => {
    lastTriggerRef.current = (document.activeElement as HTMLElement) || null;
    const nextSession = ++drawerSessionRef.current;
    activePickupTripIdRef.current = trip.trip_id;
    setSelectedTripPickups(trip);
    // Reset state immediately
    setPickups([]);
    setLoadingPickups(false);
    setSubmittingPickup(false);
    setPickupFetchError(null);
    setPickupActionError(null);
    setPickupActionSuccess(null);
    setEditingPickupId(null);
    setPickupPage(1);
    setNewPickupName("");
    setNewPickupAddress("");

    loadPickupsForTrip(trip.trip_id, 1, nextSession);
  };

  // F02 & R2: Show error and success messages inside drawer, guard against cross-drawer draft wipe
  const handleCreatePickup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTripPickups || !newPickupName.trim() || !newPickupAddress.trim()) return;

    const mutationSession = drawerSessionRef.current;
    const targetTripId = selectedTripPickups.trip_id;
    const mutationId = ++pickupMutationIdRef.current;

    setPickupActionError(null);
    setPickupActionSuccess(null);
    pickupsCloseBtnRef.current?.focus();
    setSubmittingPickup(true);

    try {
      await createStaffPickup(targetTripId, {
        name: newPickupName.trim(),
        address: newPickupAddress.trim(),
      });

      // R2 Guard: if user closed or changed drawer, discard UI side-effects
      if (
        drawerSessionRef.current !== mutationSession ||
        activePickupTripIdRef.current !== targetTripId
      ) {
        return;
      }

      setNewPickupName("");
      setNewPickupAddress("");
      setPickupActionSuccess("Đã thêm điểm đón thành công.");
      loadPickupsForTrip(targetTripId, pickupPage, mutationSession);
    } catch (err) {
      if (
        drawerSessionRef.current !== mutationSession ||
        activePickupTripIdRef.current !== targetTripId
      ) {
        return;
      }
      setPickupActionError(err instanceof Error ? err.message : "Không thể tạo điểm đón.");
    } finally {
      if (pickupMutationIdRef.current === mutationId) {
        setSubmittingPickup(false);
      }
    }
  };

  // F04: Edit pickup handler with R2 guards
  const handleStartEditPickup = (pickup: PickupDto) => {
    setEditingPickupId(pickup.pickup_id);
    setEditPickupName(pickup.name);
    setEditPickupAddress(pickup.address);
    setPickupActionError(null);
    setPickupActionSuccess(null);
  };

  const handleCancelEditPickup = () => {
    setEditingPickupId(null);
    setEditPickupName("");
    setEditPickupAddress("");
  };

  const handleSaveEditPickup = async (pickupId: number) => {
    if (!selectedTripPickups || !editPickupName.trim() || !editPickupAddress.trim()) return;

    const mutationSession = drawerSessionRef.current;
    const targetTripId = selectedTripPickups.trip_id;
    const mutationId = ++pickupMutationIdRef.current;

    setPickupActionError(null);
    setPickupActionSuccess(null);
    pickupsCloseBtnRef.current?.focus();
    setSubmittingPickup(true);

    try {
      const updated = await updateStaffPickup(targetTripId, pickupId, {
        name: editPickupName.trim(),
        address: editPickupAddress.trim(),
      });

      if (
        drawerSessionRef.current !== mutationSession ||
        activePickupTripIdRef.current !== targetTripId
      ) {
        return;
      }

      setPickups((prev) =>
        prev.map((item) => (item.pickup_id === pickupId ? updated : item))
      );
      setEditingPickupId(null);
      setPickupActionSuccess(`Đã cập nhật thông tin điểm đón "${updated.name}" thành công.`);
    } catch (err) {
      if (
        drawerSessionRef.current !== mutationSession ||
        activePickupTripIdRef.current !== targetTripId
      ) {
        return;
      }
      setPickupActionError(err instanceof Error ? err.message : "Không thể cập nhật điểm đón.");
    } finally {
      if (pickupMutationIdRef.current === mutationId) {
        setSubmittingPickup(false);
      }
    }
  };

  const handleTogglePickupActive = async (pickup: PickupDto) => {
    if (!selectedTripPickups) return;

    const mutationSession = drawerSessionRef.current;
    const targetTripId = selectedTripPickups.trip_id;
    const mutationId = ++pickupMutationIdRef.current;

    setPickupActionError(null);
    setPickupActionSuccess(null);
    pickupsCloseBtnRef.current?.focus();
    setSubmittingPickup(true);

    try {
      if (pickup.is_active) {
        await retireStaffPickup(targetTripId, pickup.pickup_id);
        if (
          drawerSessionRef.current === mutationSession &&
          activePickupTripIdRef.current === targetTripId
        ) {
          setPickupActionSuccess(`Đã tạm ẩn điểm đón "${pickup.name}".`);
        }
      } else {
        await updateStaffPickup(targetTripId, pickup.pickup_id, { is_active: true });
        if (
          drawerSessionRef.current === mutationSession &&
          activePickupTripIdRef.current === targetTripId
        ) {
          setPickupActionSuccess(`Đã mở lại điểm đón "${pickup.name}".`);
        }
      }
      if (
        drawerSessionRef.current === mutationSession &&
        activePickupTripIdRef.current === targetTripId
      ) {
        loadPickupsForTrip(targetTripId, pickupPage, mutationSession);
      }
    } catch (err) {
      if (
        drawerSessionRef.current === mutationSession &&
        activePickupTripIdRef.current === targetTripId
      ) {
        setPickupActionError(err instanceof Error ? err.message : "Không thể cập nhật trạng thái điểm đón.");
      }
    } finally {
      if (pickupMutationIdRef.current === mutationId) {
        setSubmittingPickup(false);
      }
    }
  };

  if (!isManager) {
    return (
      <div className="p-6 rounded-3xl bg-neutral-50 border border-neutral-200/80 text-center space-y-2">
        <ShieldAlert className="w-8 h-8 text-neutral-400 mx-auto" />
        <h4 className="text-sm font-bold text-neutral-800">Quyền hạn quản lý tuyến</h4>
        <p className="text-xs text-neutral-500 max-w-md mx-auto">
          Tài khoản vai trò {actorRole} có quyền xem danh mục tuyến ở chế độ công khai. Chức năng tạo, sửa, ẩn tuyến và quản lý điểm đón chỉ dành cho Quản lý Tuyến (RouteMgr) và Quản trị viên (Admin).
        </p>
      </div>
    );
  }

  const totalTripsCount = tripPagination?.totalItems ?? trips.length;

  return (
    <div className="space-y-6">
      {/* Messages */}
      {actionError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-500 hover:text-red-700"
            aria-label="Đóng thông báo lỗi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-500 hover:text-emerald-700"
            aria-label="Đóng thông báo thành công"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-neutral-900 uppercase">
            Quản lý Danh mục Tuyến Trekking ({totalTripsCount})
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Xem, thêm mới, sửa thông tin, tạm ẩn hoặc mở lại tuyến dã ngoại và các điểm đón xe bus.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadTrips(tripPage)}
            disabled={loading || isPending}
            className="p-2 rounded-xl border border-neutral-300 hover:bg-neutral-100 text-neutral-700 text-xs font-bold transition-colors disabled:opacity-50"
            title="Làm mới"
            aria-label="Làm mới danh sách tuyến"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              lastTriggerRef.current = (document.activeElement as HTMLElement) || null;
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FEBB02] hover:bg-[#e5a800] text-black font-extrabold text-xs shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> Thêm tuyến mới
          </button>
        </div>
      </div>

      {/* Trips Table Container */}
      <div className="rounded-2xl border border-neutral-200/90 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 border-b border-neutral-200 uppercase font-bold text-neutral-500">
              <tr>
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Tên tuyến</th>
                <th className="py-3 px-4">Tỉnh/Thành</th>
                <th className="py-3 px-4">Cự ly</th>
                <th className="py-3 px-4">Độ cao</th>
                <th className="py-3 px-4">Giá cơ sở</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/70">
              {/* F06: Dedicated Loading State */}
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-6 h-6 animate-spin text-[#FEBB02]" />
                      <span className="text-xs font-bold text-neutral-600">Đang tải danh sách tuyến trekking...</span>
                    </div>
                  </td>
                </tr>
              ) : actionError && trips.length === 0 ? (
                /* F06: Dedicated Error State with Retry */
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <AlertCircle className="w-8 h-8 text-red-500" />
                      <span className="text-sm font-bold text-red-900">Không thể tải danh mục tuyến</span>
                      <p className="text-xs text-neutral-500">{actionError}</p>
                      <button
                        type="button"
                        onClick={() => loadTrips(tripPage)}
                        className="mt-2 px-4 py-1.5 rounded-xl bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 transition-colors"
                      >
                        Thử lại
                      </button>
                    </div>
                  </td>
                </tr>
              ) : trips.length === 0 ? (
                /* F06: Dedicated Empty State with CTA */
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <div className="flex flex-col items-center justify-center gap-2.5 max-w-sm mx-auto">
                      <Bus className="w-10 h-10 text-neutral-300" />
                      <span className="text-sm font-bold text-neutral-800">Chưa có tuyến trekking nào</span>
                      <p className="text-xs text-neutral-500">
                        Hệ thống chưa có tuyến dã ngoại nào được kích hoạt. Hãy tạo tuyến đầu tiên để bắt đầu vận hành.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FEBB02] hover:bg-[#e5a800] text-black font-extrabold text-xs shadow-sm transition-all"
                      >
                        <Plus className="w-4 h-4" /> Thêm tuyến mới
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                /* Normal Rows */
                trips.map((trip) => (
                  <tr key={trip.trip_id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-neutral-600">#{trip.trip_id}</td>
                    <td className="py-3 px-4 font-bold text-neutral-900 max-w-xs truncate">
                      <Link
                        href={`/trips/${trip.trip_id}`}
                        className="hover:text-[#186734] hover:underline"
                        target="_blank"
                      >
                        {trip.name}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-neutral-700">{trip.city}</td>
                    <td className="py-3 px-4 text-neutral-700">{parseFloat(trip.length_km)} km</td>
                    <td className="py-3 px-4 text-neutral-700">
                      {trip.peak_height_m ? `${trip.peak_height_m}m` : "-"}
                    </td>
                    <td className="py-3 px-4 font-black text-neutral-900">{formatVnd(trip.base_price)}</td>
                    <td className="py-3 px-4">
                      {trip.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> Đang mở
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-neutral-200 text-neutral-700 text-[11px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" /> Tạm ẩn
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenPickups(trip)}
                          className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-700 transition-colors"
                          title="Quản lý điểm đón"
                          aria-label={`Quản lý điểm đón tuyến ${trip.name}`}
                        >
                          <Bus className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            lastTriggerRef.current = (document.activeElement as HTMLElement) || null;
                            setEditingTrip(trip);
                          }}
                          className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-700 transition-colors"
                          title="Sửa tuyến"
                          aria-label={`Sửa tuyến ${trip.name}`}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleTripActive(trip)}
                          disabled={isPending}
                          className={`p-1.5 rounded-lg border text-xs font-bold transition-colors ${
                            trip.is_active
                              ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          }`}
                          title={trip.is_active ? "Tạm ẩn tuyến" : "Mở lại tuyến"}
                          aria-label={trip.is_active ? `Tạm ẩn tuyến ${trip.name}` : `Mở lại tuyến ${trip.name}`}
                        >
                          {trip.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* F03: Trips Pagination Controls */}
        {tripPagination && tripPagination.totalPages > 1 && (
          <div className="p-3.5 px-4 bg-neutral-50/80 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-600">
            <div>
              Hiển thị{" "}
              <span className="font-bold text-neutral-900">
                {(tripPage - 1) * tripPageSize + 1}
              </span>{" "}
              –{" "}
              <span className="font-bold text-neutral-900">
                {Math.min(tripPage * tripPageSize, tripPagination.totalItems)}
              </span>{" "}
              trong tổng số{" "}
              <span className="font-bold text-neutral-900">{tripPagination.totalItems}</span> tuyến
              (Trang {tripPagination.page} / {tripPagination.totalPages})
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => loadTrips(tripPage - 1)}
                disabled={tripPage <= 1 || loading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 font-bold text-neutral-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                aria-label="Trang trước"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Trước
              </button>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: tripPagination.totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => loadTrips(p)}
                    disabled={loading}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                      tripPage === p
                        ? "bg-[#FEBB02] text-black shadow-xs font-black"
                        : "bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => loadTrips(tripPage + 1)}
                disabled={tripPage >= tripPagination.totalPages || loading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 font-bold text-neutral-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                aria-label="Trang sau"
              >
                Sau <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <CreateTripModal
          onClose={() => {
            setShowCreateModal(false);
            lastTriggerRef.current?.focus();
            lastTriggerRef.current = null;
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setSuccessMsg("Tạo mới tuyến trekking thành công.");
            loadTrips(1);
            lastTriggerRef.current?.focus();
            lastTriggerRef.current = null;
          }}
        />
      )}

      {/* EDIT MODAL */}
      {editingTrip && (
        <EditTripModal
          trip={editingTrip}
          onClose={() => {
            setEditingTrip(null);
            lastTriggerRef.current?.focus();
            lastTriggerRef.current = null;
          }}
          onSuccess={() => {
            setEditingTrip(null);
            setSuccessMsg("Cập nhật thông tin tuyến thành công.");
            loadTrips(tripPage);
            lastTriggerRef.current?.focus();
            lastTriggerRef.current = null;
          }}
        />
      )}

      {/* PICKUPS DRAWER (F01, F02, F03, F04, R1, R2, R3) */}
      {selectedTripPickups && (
        <div
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          aria-labelledby="pickups-drawer-title"
          ref={pickupsDialogRef}
          className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
              <div>
                <h4 id="pickups-drawer-title" className="font-extrabold text-base text-neutral-900 uppercase">
                  Điểm đón xe bus: {selectedTripPickups.name}
                </h4>
                <p className="text-xs text-neutral-500">Quản lý danh sách các điểm đón khách cố định của tuyến</p>
              </div>
              <button
                type="button"
                autoFocus
                ref={pickupsCloseBtnRef}
                onClick={handleClosePickups}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg transition-colors focus:ring-2 focus:ring-[#FEBB02] focus:outline-none"
                aria-label="Đóng cửa sổ điểm đón"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* F02: Drawer-specific Action Alerts */}
            {pickupActionError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between gap-2 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{pickupActionError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPickupActionError(null)}
                  className="text-red-500 hover:text-red-700"
                  aria-label="Đóng thông báo lỗi điểm đón"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {pickupActionSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{pickupActionSuccess}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPickupActionSuccess(null)}
                  className="text-emerald-500 hover:text-emerald-700"
                  aria-label="Đóng thông báo thành công"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Existing Pickups List (F01, F03, F04, R1) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-700">
                  Danh sách điểm đón ({pickupPagination?.totalItems ?? pickups.length}):
                </span>
                {loadingPickups && (
                  <span className="text-[11px] text-neutral-400 flex items-center gap-1 font-medium">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Đang cập nhật
                  </span>
                )}
              </div>

              {/* F01: Error state with retry inside drawer */}
              {pickupFetchError ? (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-center space-y-2">
                  <p className="text-xs text-red-800 font-semibold">{pickupFetchError}</p>
                  <button
                    type="button"
                    onClick={() => loadPickupsForTrip(selectedTripPickups.trip_id, pickupPage)}
                    className="px-3 py-1 bg-red-800 text-white rounded-lg text-xs font-bold hover:bg-red-900 transition-colors"
                  >
                    Thử tải lại
                  </button>
                </div>
              ) : loadingPickups && pickups.length === 0 ? (
                <div className="text-xs text-neutral-500 text-center py-6 bg-neutral-50 rounded-xl">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#FEBB02] mx-auto mb-1.5" />
                  Đang tải danh sách điểm đón...
                </div>
              ) : pickups.length === 0 ? (
                <div className="text-xs text-neutral-500 text-center py-5 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
                  Chưa có điểm đón nào cho tuyến này. Thêm điểm đón mới bên dưới.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {pickups.map((p) => {
                    const isEditing = editingPickupId === p.pickup_id;

                    return (
                      <div
                        key={p.pickup_id}
                        className={`p-3 rounded-xl border transition-all text-xs ${
                          isEditing
                            ? "bg-amber-50/70 border-amber-300"
                            : "bg-neutral-50 border-neutral-200 hover:border-neutral-300"
                        }`}
                      >
                        {isEditing ? (
                          /* F04: Inline Edit Form */
                          <div className="space-y-2.5">
                            <div className="font-bold text-neutral-900 text-xs">Sửa điểm đón #{p.pickup_id}</div>
                            <input
                              type="text"
                              value={editPickupName}
                              onChange={(e) => setEditPickupName(e.target.value)}
                              placeholder="Tên điểm đón"
                              aria-label="Tên điểm đón"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 text-xs bg-white focus:ring-1 focus:ring-[#FEBB02]"
                              required
                            />
                            <input
                              type="text"
                              value={editPickupAddress}
                              onChange={(e) => setEditPickupAddress(e.target.value)}
                              placeholder="Địa chỉ cụ thể"
                              aria-label="Địa chỉ cụ thể"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 text-xs bg-white focus:ring-1 focus:ring-[#FEBB02]"
                              required
                            />
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleCancelEditPickup}
                                disabled={submittingPickup}
                                className="px-2.5 py-1 rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 text-xs font-bold"
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditPickup(p.pickup_id)}
                                disabled={submittingPickup || !editPickupName.trim() || !editPickupAddress.trim()}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-black text-white hover:bg-neutral-800 text-xs font-bold disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" /> Lưu
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* View Mode */
                          <div className="flex items-center justify-between gap-3">
                            <div className="space-y-0.5 flex-1 min-w-0">
                              <div className="font-bold text-neutral-900 flex items-center gap-1.5 truncate">
                                <span>{p.name}</span>
                                {!p.is_active && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-200 text-neutral-600 font-bold shrink-0">
                                    Ẩn
                                  </span>
                                )}
                              </div>
                              <div className="text-neutral-500 text-[11px] truncate">{p.address}</div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {/* F04: Edit Button */}
                              <button
                                type="button"
                                onClick={() => handleStartEditPickup(p)}
                                disabled={submittingPickup}
                                className="p-1 rounded-md text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/70 transition-colors"
                                title="Sửa thông tin điểm đón"
                                aria-label={`Sửa điểm đón ${p.name}`}
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              {/* Toggle Active Button */}
                              <button
                                type="button"
                                onClick={() => handleTogglePickupActive(p)}
                                disabled={submittingPickup}
                                className={`p-1 rounded-md transition-colors ${
                                  p.is_active
                                    ? "text-amber-700 hover:bg-amber-100"
                                    : "text-emerald-700 hover:bg-emerald-100"
                                }`}
                                title={p.is_active ? `Tạm ẩn điểm đón ${p.name}` : `Mở lại điểm đón ${p.name}`}
                                aria-label={p.is_active ? `Tạm ẩn điểm đón ${p.name}` : `Mở lại điểm đón ${p.name}`}
                              >
                                {p.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* F03: Pickups Pagination Controls */}
              {pickupPagination && pickupPagination.totalPages > 1 && (
                <div className="pt-2 flex items-center justify-between border-t border-neutral-200 text-xs text-neutral-600">
                  <span>
                    Trang {pickupPage} / {pickupPagination.totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => loadPickupsForTrip(selectedTripPickups.trip_id, pickupPage - 1)}
                      disabled={pickupPage <= 1 || loadingPickups}
                      className="px-2.5 py-1 rounded-md border border-neutral-300 bg-white hover:bg-neutral-100 font-bold disabled:opacity-40"
                    >
                      Trước
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPickupsForTrip(selectedTripPickups.trip_id, pickupPage + 1)}
                      disabled={pickupPage >= pickupPagination.totalPages || loadingPickups}
                      className="px-2.5 py-1 rounded-md border border-neutral-300 bg-white hover:bg-neutral-100 font-bold disabled:opacity-40"
                    >
                      Sau
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Add Pickup Form */}
            <form onSubmit={handleCreatePickup} className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-3">
              <span className="text-xs font-bold text-neutral-800 block">Thêm điểm đón mới:</span>
              <div className="space-y-1">
                <label htmlFor="new-pickup-name" className="text-[11px] font-bold text-neutral-600">
                  Tên điểm đón *
                </label>
                <input
                  id="new-pickup-name"
                  type="text"
                  value={newPickupName}
                  onChange={(e) => setNewPickupName(e.target.value)}
                  placeholder="VD: Cây xăng Comeco Hàng Xanh"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs bg-white focus:ring-1 focus:ring-[#FEBB02]"
                  required
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="new-pickup-address" className="text-[11px] font-bold text-neutral-600">
                  Địa chỉ cụ thể *
                </label>
                <input
                  id="new-pickup-address"
                  type="text"
                  value={newPickupAddress}
                  onChange={(e) => setNewPickupAddress(e.target.value)}
                  placeholder="VD: 178 Điện Biên Phủ, P. 21, Q. Bình Thạnh, TP.HCM"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs bg-white focus:ring-1 focus:ring-[#FEBB02]"
                  required
                />
              </div>
              <div className="text-right pt-1">
                <button
                  type="submit"
                  disabled={submittingPickup || !newPickupName.trim() || !newPickupAddress.trim()}
                  className="px-4 py-2 rounded-xl bg-black text-white hover:bg-neutral-800 text-xs font-bold disabled:opacity-50 transition-colors"
                >
                  {submittingPickup ? "Đang lưu..." : "Thêm điểm đón"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MODALS
// ---------------------------------------------------------------------------

function CreateTripModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<TripInput>({
    name: "",
    city: "",
    district: "",
    location_name: "",
    difficulty_level: "",
    length_km: "10.00",
    peak_height_m: null,
    base_price: "500000",
    description: "",
    schedule_content: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeBtnRef.current?.focus();

    const handleDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");

        if (focusables.length === 0) { e.preventDefault(); return; }
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];

        if (!dialog.contains(document.activeElement)) {
          e.preventDefault();
          if (e.shiftKey) {
            lastEl.focus();
          } else {
            firstEl.focus();
          }
          return;
        }

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    closeBtnRef.current?.focus();
    setSubmitting(true);
    setError(null);

    try {
      const payload: TripInput = {
        name: form.name.trim(),
        city: form.city.trim(),
        district: form.district?.trim() || null,
        location_name: form.location_name.trim(),
        difficulty_level: form.difficulty_level?.trim() || null,
        length_km: form.length_km.trim(),
        peak_height_m: form.peak_height_m ? Number(form.peak_height_m) : null,
        base_price: form.base_price.trim(),
        description: form.description.trim(),
        schedule_content: form.schedule_content.trim(),
      };

      await createStaffTrip(payload);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo tuyến trekking");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      ref={dialogRef}
      aria-labelledby="create-trip-modal-title"
      className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
          <div>
            <h4 id="create-trip-modal-title" className="font-extrabold text-base text-neutral-900 uppercase">
              Tạo mới Tuyến Trekking
            </h4>
            <p className="text-xs text-neutral-500">Nhập đầy đủ thông tin kỹ thuật và nội dung hành trình</p>
          </div>
          <button
            type="button"
            autoFocus
            ref={closeBtnRef}
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg transition-colors focus:ring-2 focus:ring-[#FEBB02] focus:outline-none"
            aria-label="Đóng biểu mẫu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 text-red-800 text-xs border border-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="create-trip-name" className="font-bold text-neutral-800">
                Tên tuyến *
              </label>
              <input
                id="create-trip-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Trail Bus – Núi Bà Đen"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-location-name" className="font-bold text-neutral-800">
                Địa danh *
              </label>
              <input
                id="create-location-name"
                type="text"
                required
                value={form.location_name}
                onChange={(e) => setForm({ ...form, location_name: e.target.value })}
                placeholder="VD: Cột Điện - Đỉnh Bà Đen"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-city" className="font-bold text-neutral-800">
                Tỉnh / Thành phố *
              </label>
              <input
                id="create-city"
                type="text"
                required
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="VD: Tây Ninh"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-district" className="font-bold text-neutral-800">
                Quận / Huyện
              </label>
              <input
                id="create-district"
                type="text"
                value={form.district || ""}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                placeholder="VD: Thành phố Tây Ninh"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-length-km" className="font-bold text-neutral-800">
                Cự ly quãng đường (km) *
              </label>
              <input
                id="create-length-km"
                type="text"
                required
                value={form.length_km}
                onChange={(e) => setForm({ ...form, length_km: e.target.value })}
                placeholder="VD: 11.50"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-peak-height" className="font-bold text-neutral-800">
                Độ cao đỉnh (m)
              </label>
              <input
                id="create-peak-height"
                type="number"
                value={form.peak_height_m ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    peak_height_m: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="VD: 986"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-difficulty" className="font-bold text-neutral-800">
                Cấp độ khó
              </label>
              <input
                id="create-difficulty"
                type="text"
                value={form.difficulty_level || ""}
                onChange={(e) => setForm({ ...form, difficulty_level: e.target.value })}
                placeholder="VD: Cấp 3 hoặc Trung bình"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="create-base-price" className="font-bold text-neutral-800">
                Giá vé cơ sở (VND) *
              </label>
              <input
                id="create-base-price"
                type="text"
                required
                value={form.base_price}
                onChange={(e) => setForm({ ...form, base_price: e.target.value })}
                placeholder="VD: 650000"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono font-bold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="create-description" className="font-bold text-neutral-800">
              Mô tả cung đường dã ngoại *
            </label>
            <textarea
              id="create-description"
              required
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Chi tiết về thảm thực vật, đặc điểm cung đường, chuẩn bị thể lực..."
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-sans"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="create-schedule-content" className="font-bold text-neutral-800">
              Lịch trình dự kiến (Schedule Content) *
            </label>
            <textarea
              id="create-schedule-content"
              required
              rows={4}
              value={form.schedule_content}
              onChange={(e) => setForm({ ...form, schedule_content: e.target.value })}
              placeholder="05:30 Đón khách tại TP.HCM&#10;08:30 Khởi hành trekking&#10;17:00 Xe đón về lại Sài Gòn..."
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-sans"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 font-bold hover:bg-neutral-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-[#FEBB02] hover:bg-[#e5a800] text-black font-extrabold disabled:opacity-50"
            >
              {submitting ? "Đang xử lý..." : "Lưu Tuyến"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditTripModal({
  trip,
  onClose,
  onSuccess,
}: {
  trip: TripSummaryDto;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(trip.name);
  const [city, setCity] = useState(trip.city);
  const [district, setDistrict] = useState(trip.district || "");
  const [locationName, setLocationName] = useState(trip.location_name);
  const [lengthKm, setLengthKm] = useState(trip.length_km);
  const [basePrice, setBasePrice] = useState(trip.base_price);
  const [difficultyLevel, setDifficultyLevel] = useState(trip.difficulty_level || "");
  const [peakHeight, setPeakHeight] = useState<number | string>(trip.peak_height_m ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeBtnRef.current?.focus();

    const handleDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");

        if (focusables.length === 0) { e.preventDefault(); return; }
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];

        if (!dialog.contains(document.activeElement)) {
          e.preventDefault();
          if (e.shiftKey) {
            lastEl.focus();
          } else {
            firstEl.focus();
          }
          return;
        }

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    closeBtnRef.current?.focus();
    setSubmitting(true);
    setError(null);

    try {
      const patch: TripPatch = {};
      if (name.trim() !== trip.name) patch.name = name.trim();
      if (city.trim() !== trip.city) patch.city = city.trim();
      if ((district.trim() || null) !== trip.district) patch.district = district.trim() || null;
      if (locationName.trim() !== trip.location_name) patch.location_name = locationName.trim();
      if (lengthKm.trim() !== trip.length_km) patch.length_km = lengthKm.trim();
      if (basePrice.trim() !== trip.base_price) patch.base_price = basePrice.trim();
      if ((difficultyLevel.trim() || null) !== trip.difficulty_level) {
        patch.difficulty_level = difficultyLevel.trim() || null;
      }
      const newHeight = peakHeight === "" ? null : Number(peakHeight);
      if (newHeight !== trip.peak_height_m) patch.peak_height_m = newHeight;

      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }

      await updateStaffTrip(trip.trip_id, patch);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể cập nhật tuyến");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      ref={dialogRef}
      aria-labelledby="edit-trip-modal-title"
      className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
          <div>
            <h4 id="edit-trip-modal-title" className="font-extrabold text-base text-neutral-900 uppercase">
              Cập nhật tuyến: #{trip.trip_id}
            </h4>
            <p className="text-xs text-neutral-500">Chỉnh sửa thông số kỹ thuật và giá cơ sở</p>
          </div>
          <button
            type="button"
            autoFocus
            ref={closeBtnRef}
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg transition-colors focus:ring-2 focus:ring-[#FEBB02] focus:outline-none"
            aria-label="Đóng biểu mẫu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 text-red-800 text-xs border border-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label htmlFor="edit-name" className="font-bold text-neutral-800">
              Tên tuyến
            </label>
            <input
              id="edit-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-300"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="edit-city" className="font-bold text-neutral-800">
                Tỉnh/Thành
              </label>
              <input
                id="edit-city"
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-district" className="font-bold text-neutral-800">
                Quận/Huyện (tùy chọn)
              </label>
              <input
                id="edit-district"
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="VD: Lạc Dương"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-location-name" className="font-bold text-neutral-800">
                Địa danh
              </label>
              <input
                id="edit-location-name"
                type="text"
                required
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-length-km" className="font-bold text-neutral-800">
                Cự ly (km)
              </label>
              <input
                id="edit-length-km"
                type="text"
                required
                value={lengthKm}
                onChange={(e) => setLengthKm(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-base-price" className="font-bold text-neutral-800">
                Giá vé cơ sở (VND)
              </label>
              <input
                id="edit-base-price"
                type="text"
                required
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-difficulty" className="font-bold text-neutral-800">
                Độ khó (tùy chọn)
              </label>
              <input
                id="edit-difficulty"
                type="text"
                value={difficultyLevel}
                onChange={(e) => setDifficultyLevel(e.target.value)}
                placeholder="VD: Dễ, Trung bình, Khó"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-peak-height" className="font-bold text-neutral-800">
                Độ cao đỉnh (m, tùy chọn)
              </label>
              <input
                id="edit-peak-height"
                type="number"
                value={peakHeight}
                onChange={(e) => setPeakHeight(e.target.value)}
                placeholder="VD: 2167"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 font-bold hover:bg-neutral-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-black text-white hover:bg-neutral-800 font-extrabold disabled:opacity-50"
            >
              {submitting ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
