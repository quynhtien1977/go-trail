"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import type { Role } from "@/schemas/auth";
import type { TripSummaryDto, PickupDto, TripInput, TripPatch } from "@/schemas/catalog";
import {
  fetchStaffTrips,
  createStaffTrip,
  updateStaffTrip,
  retireStaffTrip,
  fetchStaffPickups,
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
} from "lucide-react";

interface StaffCatalogManagerProps {
  actorRole: Role;
}

export function StaffCatalogManager({ actorRole }: StaffCatalogManagerProps) {
  const isManager = actorRole === "RouteMgr" || actorRole === "Admin";

  const [trips, setTrips] = useState<TripSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripSummaryDto | null>(null);
  const [selectedTripPickups, setSelectedTripPickups] = useState<TripSummaryDto | null>(null);
  const [pickups, setPickups] = useState<PickupDto[]>([]);
  const [loadingPickups, setLoadingPickups] = useState(false);

  // New pickup form
  const [newPickupName, setNewPickupName] = useState("");
  const [newPickupAddress, setNewPickupAddress] = useState("");

  const [isPending, startTransition] = useTransition();

  const loadTrips = () => {
    setLoading(true);
    setActionError(null);
    fetchStaffTrips({ pageSize: 50 })
      .then((data) => {
        setTrips(data.items);
      })
      .catch((err) => {
        setActionError(err instanceof Error ? err.message : "Lỗi tải danh mục tuyến");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isManager) {
      const timer = setTimeout(() => {
        loadTrips();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isManager]);

  const handleToggleTripActive = (trip: TripSummaryDto) => {
    setActionError(null);
    setSuccessMsg(null);

    startTransition(async () => {
      try {
        if (trip.is_active) {
          // Retire (DELETE)
          await retireStaffTrip(trip.trip_id);
          setSuccessMsg(`Đã tạm ẩn tuyến "${trip.name}" thành công.`);
        } else {
          // Restore (PATCH is_active: true)
          await updateStaffTrip(trip.trip_id, { is_active: true });
          setSuccessMsg(`Đã kích hoạt lại tuyến "${trip.name}" thành công.`);
        }
        loadTrips();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Thao tác không thành công.");
      }
    });
  };

  const handleOpenPickups = (trip: TripSummaryDto) => {
    setSelectedTripPickups(trip);
    setLoadingPickups(true);
    fetchStaffPickups(trip.trip_id)
      .then(setPickups)
      .catch((err) => setActionError(err instanceof Error ? err.message : "Lỗi tải điểm đón"))
      .finally(() => setLoadingPickups(false));
  };

  const handleCreatePickup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTripPickups || !newPickupName.trim() || !newPickupAddress.trim()) return;

    startTransition(async () => {
      try {
        await createStaffPickup(selectedTripPickups.trip_id, {
          name: newPickupName.trim(),
          address: newPickupAddress.trim(),
        });
        setNewPickupName("");
        setNewPickupAddress("");
        const updated = await fetchStaffPickups(selectedTripPickups.trip_id);
        setPickups(updated);
        setSuccessMsg("Đã thêm điểm đón thành công.");
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Không thể tạo điểm đón.");
      }
    });
  };

  const handleTogglePickupActive = (pickup: PickupDto) => {
    if (!selectedTripPickups) return;

    startTransition(async () => {
      try {
        if (pickup.is_active) {
          await retireStaffPickup(selectedTripPickups.trip_id, pickup.pickup_id);
        } else {
          await updateStaffPickup(selectedTripPickups.trip_id, pickup.pickup_id, { is_active: true });
        }
        const updated = await fetchStaffPickups(selectedTripPickups.trip_id);
        setPickups(updated);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Không thể cập nhật điểm đón.");
      }
    });
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

  return (
    <div className="space-y-6">
      {/* Messages */}
      {actionError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError(null)} className="text-red-500 hover:text-red-700">
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
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-neutral-900 uppercase">
            Quản lý Danh mục Tuyến Trekking ({trips.length})
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Xem, thêm mới, sửa thông tin, tạm ẩn hoặc mở lại tuyến dã ngoại và các điểm đón xe bus.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadTrips}
            disabled={loading || isPending}
            className="p-2 rounded-xl border border-neutral-300 hover:bg-neutral-100 text-neutral-700 text-xs font-bold transition-colors disabled:opacity-50"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FEBB02] hover:bg-[#e5a800] text-black font-extrabold text-xs shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> Thêm tuyến mới
          </button>
        </div>
      </div>

      {/* Trips Table */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200/90 bg-white">
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
            {trips.map((trip) => (
              <tr key={trip.trip_id} className="hover:bg-neutral-50/50 transition-colors">
                <td className="py-3 px-4 font-mono font-bold text-neutral-600">#{trip.trip_id}</td>
                <td className="py-3 px-4 font-bold text-neutral-900 max-w-xs truncate">
                  <Link href={`/trips/${trip.trip_id}`} className="hover:text-[#186734] hover:underline" target="_blank">
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
                    {/* Pickups management */}
                    <button
                      type="button"
                      onClick={() => handleOpenPickups(trip)}
                      className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-700"
                      title="Quản lý điểm đón"
                    >
                      <Bus className="w-3.5 h-3.5" />
                    </button>

                    {/* Edit trip */}
                    <button
                      type="button"
                      onClick={() => setEditingTrip(trip)}
                      className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-700"
                      title="Sửa tuyến"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    {/* Toggle Active / Inactive */}
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
                    >
                      {trip.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <CreateTripModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            setSuccessMsg("Tạo mới tuyến trekking thành công.");
            loadTrips();
          }}
        />
      )}

      {/* EDIT MODAL */}
      {editingTrip && (
        <EditTripModal
          trip={editingTrip}
          onClose={() => setEditingTrip(null)}
          onSuccess={() => {
            setEditingTrip(null);
            setSuccessMsg("Cập nhật thông tin tuyến thành công.");
            loadTrips();
          }}
        />
      )}

      {/* PICKUPS DRAWER / MODAL */}
      {selectedTripPickups && (
        <div className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
              <div>
                <h4 className="font-extrabold text-base text-neutral-900 uppercase">
                  Điểm đón xe bus: {selectedTripPickups.name}
                </h4>
                <p className="text-xs text-neutral-500">Quản lý các điểm đón khách cố định của tuyến</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTripPickups(null)}
                className="text-neutral-400 hover:text-neutral-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Existing Pickups List */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-neutral-700 block">Danh sách điểm đón ({pickups.length}):</span>
              {loadingPickups ? (
                <div className="text-xs text-neutral-500 text-center py-4">Đang tải điểm đón...</div>
              ) : pickups.length === 0 ? (
                <div className="text-xs text-neutral-500 text-center py-4 bg-neutral-50 rounded-xl">
                  Chưa có điểm đón nào. Hãy thêm điểm đón đầu tiên bên dưới.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {pickups.map((p) => (
                    <div
                      key={p.pickup_id}
                      className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-neutral-900 flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {!p.is_active && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-200 text-neutral-600">Ẩn</span>
                          )}
                        </div>
                        <div className="text-neutral-500 text-[11px]">{p.address}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleTogglePickupActive(p)}
                        className={`p-1 rounded-md text-xs font-bold ${
                          p.is_active ? "text-amber-700 hover:bg-amber-100" : "text-emerald-700 hover:bg-emerald-100"
                        }`}
                        title={p.is_active ? "Tạm ẩn điểm đón" : "Mở lại điểm đón"}
                      >
                        {p.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Pickup Form */}
            <form onSubmit={handleCreatePickup} className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-3">
              <span className="text-xs font-bold text-neutral-800 block">Thêm điểm đón mới:</span>
              <input
                type="text"
                value={newPickupName}
                onChange={(e) => setNewPickupName(e.target.value)}
                placeholder="Tên điểm đón (VD: Cây xăng Comeco Hàng Xanh)"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs focus:ring-1 focus:ring-[#FEBB02]"
                required
              />
              <input
                type="text"
                value={newPickupAddress}
                onChange={(e) => setNewPickupAddress(e.target.value)}
                placeholder="Địa chỉ cụ thể (VD: 178 Điện Biên Phủ, P. 21, Q. Bình Thạnh, TP.HCM)"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-xs focus:ring-1 focus:ring-[#FEBB02]"
                required
              />
              <div className="text-right">
                <button
                  type="submit"
                  disabled={isPending || !newPickupName || !newPickupAddress}
                  className="px-4 py-2 rounded-xl bg-black text-white hover:bg-neutral-800 text-xs font-bold disabled:opacity-50"
                >
                  {isPending ? "Đang lưu..." : "Thêm điểm đón"}
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
          <div>
            <h4 className="font-extrabold text-base text-neutral-900 uppercase">Tạo mới Tuyến Trekking</h4>
            <p className="text-xs text-neutral-500">Nhập đầy đủ thông tin kỹ thuật và nội dung hành trình</p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 text-red-800 text-xs border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Tên tuyến *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Trail Bus – Núi Bà Đen"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Địa danh *</label>
              <input
                type="text"
                required
                value={form.location_name}
                onChange={(e) => setForm({ ...form, location_name: e.target.value })}
                placeholder="VD: Cột Điện - Đỉnh Bà Đen"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Tỉnh / Thành phố *</label>
              <input
                type="text"
                required
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="VD: Tây Ninh"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Quận / Huyện</label>
              <input
                type="text"
                value={form.district || ""}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                placeholder="VD: Thành phố Tây Ninh"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Cự ly quãng đường (km) *</label>
              <input
                type="text"
                required
                value={form.length_km}
                onChange={(e) => setForm({ ...form, length_km: e.target.value })}
                placeholder="VD: 11.50"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Độ cao đỉnh (m)</label>
              <input
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
              <label className="font-bold text-neutral-800">Cấp độ khó</label>
              <input
                type="text"
                value={form.difficulty_level || ""}
                onChange={(e) => setForm({ ...form, difficulty_level: e.target.value })}
                placeholder="VD: Cấp 3 hoặc Trung bình"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Giá vé cơ sở (VND) *</label>
              <input
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
            <label className="font-bold text-neutral-800">Mô tả cung đường dã ngoại *</label>
            <textarea
              required
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Chi tiết về thảm thực vật, đặc điểm cung đường, chuẩn bị thể lực..."
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-sans"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-neutral-800">Lịch trình dự kiến (Schedule Content) *</label>
            <textarea
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="fixed inset-0 z-[999999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
          <div>
            <h4 className="font-extrabold text-base text-neutral-900 uppercase">
              Cập nhật tuyến: #{trip.trip_id}
            </h4>
            <p className="text-xs text-neutral-500">Chỉnh sửa thông số kỹ thuật và giá cơ sở</p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 text-red-800 text-xs border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-neutral-800">Tên tuyến</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-neutral-300"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Tỉnh/Thành</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Quận/Huyện (tùy chọn)</label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="VD: Lạc Dương"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Địa danh</label>
              <input
                type="text"
                required
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Cự ly (km)</label>
              <input
                type="text"
                required
                value={lengthKm}
                onChange={(e) => setLengthKm(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Giá vé cơ sở (VND)</label>
              <input
                type="text"
                required
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Độ khó (tùy chọn)</label>
              <input
                type="text"
                value={difficultyLevel}
                onChange={(e) => setDifficultyLevel(e.target.value)}
                placeholder="VD: Dễ, Trung bình, Khó"
                className="w-full px-3 py-2 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-800">Độ cao đỉnh (m, tùy chọn)</label>
              <input
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
