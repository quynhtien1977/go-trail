"use client";

import type { CheckoutPickup, PassengerDraft, PassengerErrors } from "@/lib/booking-checkout";
import { formatVietnamDateTime } from "@/lib/catalog-client";

export type PassengerSeat = { id: number; label: string; vehicle: string };
const inputStyle = "mt-1 min-h-11 w-full rounded-[5px] border border-[#6B7280] bg-white px-3 py-2 text-sm text-[#212529] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#186734] disabled:bg-neutral-100";

export function PassengerFields({ seat, draft, errors, pickups, loading, confirmed, onChange }: {
  seat: PassengerSeat; draft: PassengerDraft; errors: PassengerErrors; pickups: CheckoutPickup[];
  loading: boolean; confirmed: boolean; onChange: (patch: Partial<PassengerDraft>) => void;
}) {
  const prefix = `passenger-${seat.id}`;
  const pickup = pickups.find(item => item.key === draft.pickup_key);
  const textFields = [
    ["passenger_name", "Họ và tên", "text", 100, `section-${seat.id} name`],
    ["passenger_phone", "Số điện thoại", "tel", 16, `section-${seat.id} tel`],
    ["emergency_contact", "Liên hệ khẩn cấp (tên và số điện thoại)", "text", 150, "off"],
  ] as const;
  return (
    <fieldset className="min-w-0 space-y-4 border-t border-neutral-200 py-5">
      <legend className="pr-3 text-base font-bold">{seat.vehicle} · Ghế {seat.label}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {textFields.map(([field, label, type, maxLength, autoComplete]) => (
          <div key={field} className={field === "emergency_contact" ? "sm:col-span-2" : ""}>
            <label htmlFor={`${prefix}-${field}`} className="text-sm font-semibold">{label} <span aria-hidden="true">*</span></label>
            <input id={`${prefix}-${field}`} name={`${prefix}-${field}`} type={type} autoComplete={autoComplete} required maxLength={maxLength}
              value={draft[field]} onChange={event => onChange({ [field]: event.target.value })}
              aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `${prefix}-${field}-error` : undefined} className={inputStyle} />
            {errors[field] && <p id={`${prefix}-${field}-error`} className="mt-1 text-sm text-[#C62828]">{errors[field]}</p>}
          </div>
        ))}
        <div className="sm:col-span-2">
          <label htmlFor={`${prefix}-pickup_key`} className="text-sm font-semibold">{confirmed ? "Điểm đón" : "Điểm đón dự kiến"} <span aria-hidden="true">*</span></label>
          <select id={`${prefix}-pickup_key`} name={`${prefix}-pickup_key`} required disabled={loading || pickups.length === 0}
            value={draft.pickup_key} onChange={event => onChange({ pickup_key: event.target.value })}
            aria-invalid={!!errors.pickup_key} aria-describedby={`${prefix}-pickup-help${errors.pickup_key ? ` ${prefix}-pickup-error` : ""}`} className={inputStyle}>
            <option value="">{loading ? "Đang tải điểm đón…" : pickups.length ? "Chọn điểm đón" : "Chưa có điểm đón để lựa chọn"}</option>
            {pickups.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}
          </select>
          <p id={`${prefix}-pickup-help`} className="mt-2 text-sm text-[#5C636A]">
            {pickup && <span className="block break-words">{pickup.address}</span>}
            {pickup?.pickup_time ? `Giờ đón: ${formatVietnamDateTime(pickup.pickup_time, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "Giờ đón theo chuyến chưa được công bố. Điểm đón dự kiến chưa phải xác nhận đặt chỗ."}
          </p>
          {errors.pickup_key && <p id={`${prefix}-pickup-error`} className="mt-1 text-sm text-[#C62828]">{errors.pickup_key}</p>}
        </div>
      </div>
      <div>
        <label htmlFor={`${prefix}-health_declaration`} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm leading-6">
          <input id={`${prefix}-health_declaration`} type="checkbox" required checked={draft.health_declaration}
            onChange={event => onChange({ health_declaration: event.target.checked })} aria-invalid={!!errors.health_declaration}
            aria-describedby={errors.health_declaration ? `${prefix}-health-error` : undefined} className="mt-1 size-5 shrink-0 accent-[#186734]" />
          <span>Tôi xác nhận hành khách có sức khỏe phù hợp để tham gia trekking và đã được cung cấp thông tin cần thiết về chuyến đi.</span>
        </label>
        {errors.health_declaration && <p id={`${prefix}-health-error`} className="text-sm text-[#C62828]">{errors.health_declaration}</p>}
      </div>
    </fieldset>
  );
}
