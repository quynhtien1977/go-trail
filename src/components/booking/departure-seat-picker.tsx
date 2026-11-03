"use client";

import { useEffect, useState } from "react";
import type { SeatMapDto } from "@/schemas/seat-map";
import { fetchDepartureSeats } from "@/lib/booking-client";
import { availableSelection } from "@/lib/booking-presentation";
import { formatVnd } from "@/lib/catalog-client";
import { SeatMap } from "./seat-map";
import { PassengerCheckout } from "./passenger-checkout";
import type { DeparturePickupSource } from "@/lib/booking-checkout";

export function DepartureSeatPicker({ tripId, tripName, departureId, departureDate, price, departurePickups, onBookingLockChange }: {
  tripId: number; tripName: string; departureId: number; departureDate: string; price: string; departurePickups?: DeparturePickupSource;
  onBookingLockChange?: (locked: boolean) => void;
}) {
  const [map, setMap] = useState<SeatMapDto | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [bookingLocked, setBookingLocked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const data = await fetchDepartureSeats(departureId, controller.signal);
        if (controller.signal.aborted) return;
        setMap(data);
        setError(null);
        // Keep selection reconciliation in render below; no server mutation.
      } catch {
        if (!controller.signal.aborted) setError("Không thể cập nhật sơ đồ ghế. Vui lòng thử lại.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timeout = setTimeout(refresh, 15000);
        }
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [departureId, revision]);

  const currentSelection = map ? availableSelection(map, selected) : [];
  if (currentSelection.length !== selected.length) {
    setSelected(currentSelection);
    setNotice("Một số ghế vừa thay đổi trạng thái và đã được bỏ khỏi danh sách đang chọn.");
  }

  const labels = map?.vehicles.flatMap(vehicle => vehicle.seats.filter(seat => currentSelection.includes(seat.dep_seat_id))
    .map(seat => seat.seat_name)) ?? [];
  const passengerSeats = map?.vehicles.flatMap((vehicle, index) => vehicle.seats.filter(seat => currentSelection.includes(seat.dep_seat_id))
    .map(seat => ({ id: seat.dep_seat_id, label: seat.seat_name, vehicle: `Xe ${index + 1}` }))) ?? [];

  return (
    <div className="space-y-4 text-[#212529]" aria-busy={loading}>
      {loading && <p role="status" className="py-8 text-center text-sm text-[#5C636A]">Đang tải sơ đồ ghế…</p>}
      {error && <p role="alert" className="text-sm text-[#C62828]">{error}</p>}
      {!loading && (
        <button type="button" onClick={() => { setLoading(true); setRevision(value => value + 1); }}
          className="min-h-10 rounded-[5px] border border-[#6B7280] px-3 text-sm font-semibold hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2">
          Cập nhật ghế
        </button>
      )}
      {map && <SeatMap map={map} selected={currentSelection} disabled={loading || !!error || bookingLocked}
        onToggle={id => { setNotice(""); setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]); }} />}
      {!loading && !error && map && !map.vehicles.some(vehicle => vehicle.seats.length) &&
        <p className="text-sm text-[#5C636A]">Chuyến này chưa có sơ đồ ghế. Vui lòng liên hệ để được hỗ trợ.</p>}
      {!loading && !error && map?.vehicles.some(vehicle => vehicle.seats.length) && !map.vehicles.some(vehicle => vehicle.seats.some(seat => seat.status === "Available")) &&
        <p role="status" className="text-sm text-[#5C636A]">Hiện chưa có ghế trống. Bạn có thể cập nhật sơ đồ hoặc chọn chuyến khác.</p>}
      <p role="status" className="text-sm text-[#8A5A00]">{notice}</p>
      <dl className="divide-y divide-neutral-200 border-y border-neutral-200 text-sm">
        <div className="flex justify-between gap-3 py-3"><dt>Ghế đang chọn</dt><dd className="text-right font-semibold">{labels.length ? labels.join(", ") : "Chưa chọn ghế"}</dd></div>
        <div className="flex justify-between gap-3 py-3"><dt>Đơn giá mỗi ghế</dt><dd className="text-right font-bold text-[#186734]">{formatVnd(price)}</dd></div>
      </dl>
      <p className="text-xs text-[#5C636A]">Ghế đang chọn chưa được giữ chỗ. Giá trị đơn hàng sẽ được xác nhận khi tạo hóa đơn.</p>
      <p className="text-sm">Vé đã mua không hủy, không hoàn và không chuyển chuyến.</p>
      <PassengerCheckout tripId={tripId} tripName={tripName} departureId={departureId} departureDate={departureDate} price={price}
        seats={passengerSeats} available={!loading && !error} departurePickups={departurePickups}
        onLockChange={locked => { setBookingLocked(locked); onBookingLockChange?.(locked); }}
        onConflict={() => { setLoading(true); setRevision(value => value + 1); }} />
    </div>
  );
}
