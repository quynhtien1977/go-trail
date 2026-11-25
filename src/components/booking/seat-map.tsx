"use client";

import { CircleGauge, LockKeyhole } from "lucide-react";
import type { SeatMapDto } from "@/schemas/seat-map";
import { seatFloors } from "@/lib/booking-presentation";

const statusLabels = { Available: "Còn trống", Locked: "Đang được giữ", Sold: "Đã bán" };

export function SeatMap({ map, selected, onToggle, disabled = false }: {
  map: SeatMapDto; selected: number[]; onToggle: (id: number) => void; disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      {map.vehicles.map((vehicle, index) => (
        <section key={vehicle.dep_vehicle_id} aria-label={`Xe ${index + 1}: ${vehicle.vehicle_type}`} className="space-y-3">
          <h4 className="text-sm font-bold">Xe {index + 1} · {vehicle.vehicle_type}</h4>
          {vehicle.seats.length === 0 && <p className="text-sm text-[#5C636A]">Xe này chưa có sơ đồ ghế.</p>}
          {seatFloors(vehicle.seats).map(floor => (
            <div key={floor.level} className="space-y-2">
              <h5 className="text-sm font-semibold">Tầng {floor.level}</h5>
              <div className="rounded-[8px] border border-neutral-300 bg-[#F8F9FA] p-1 sm:p-2">
                <div className="flex items-center justify-between gap-2 pb-4 text-xs text-[#5C636A]">
                  <span className="flex items-center gap-1"><CircleGauge aria-hidden="true" className="size-5" /> Đầu xe</span>
                  <span>Cửa lên xe</span>
                </div>
                <div className="overflow-x-auto pb-1" role="group" aria-label={`Sơ đồ xe ${index + 1}, tầng ${floor.level}`}>
                  <div className="grid gap-1" style={{
                    gridTemplateColumns: `16px repeat(${floor.columns}, minmax(36px, 1fr))`,
                    gridTemplateRows: `repeat(${floor.rows}, 44px)`,
                    minWidth: 16 + floor.columns * 40,
                  }}>
                    {Array.from({ length: floor.rows }, (_, i) => (
                      <span key={`row-${i}`} aria-hidden="true" className="flex items-center justify-center text-xs text-[#5C636A]" style={{ gridColumn: 1, gridRow: i + 1 }}>{i + 1}</span>
                    ))}
                    {floor.seats.map(({ seat, column, row }) => {
                      const active = selected.includes(seat.dep_seat_id);
                      return (
                        <button key={seat.dep_seat_id} type="button" disabled={disabled || seat.status !== "Available"}
                          aria-pressed={active} aria-label={`Ghế ${seat.seat_name}, ${active ? "đang chọn" : statusLabels[seat.status]}`}
                          onClick={() => onToggle(seat.dep_seat_id)}
                          style={{ gridColumn: column + 1, gridRow: row }}
                          className={`flex min-w-0 flex-col items-center justify-center rounded-[6px] border text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-not-allowed ${
                            seat.status === "Sold" ? "border-[#616161] bg-[#616161] text-white" :
                            seat.status === "Locked" ? "border-[#8A5A00] bg-[#FFF8E1] text-[#8A5A00]" :
                            active ? "border-black bg-[#FEBB02] text-black ring-1 ring-black" :
                            "border-[#6B7280] bg-white text-[#212529] hover:border-black"
                          }`}>
                          {seat.status === "Locked" && <LockKeyhole aria-hidden="true" className="size-3" />}
                          <span className="max-w-full truncate">{seat.seat_name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="pt-2 text-center text-xs text-[#5C636A]">Đuôi xe</p>
              </div>
            </div>
          ))}
        </section>
      ))}
      <ul aria-label="Chú thích trạng thái ghế" className="flex flex-wrap gap-x-3 gap-y-2 text-xs text-[#212529]">
        {[["bg-white border-[#6B7280]", "Còn trống"], ["bg-[#FEBB02] border-black", "Đang chọn"], ["bg-[#FFF8E1] border-[#8A5A00]", "Đang được giữ"], ["bg-[#616161] border-[#616161]", "Đã bán"]].map(([color, label]) => (
          <li key={label} className="flex items-center gap-1.5"><span aria-hidden="true" className={`size-3 shrink-0 rounded-sm border ${color}`} />{label}</li>
        ))}
      </ul>
    </div>
  );
}
