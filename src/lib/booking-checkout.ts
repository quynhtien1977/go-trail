import { holdSeatsSchema, type HoldSeatsInput } from "@/schemas/booking";
import type { DeparturePickupsDto } from "@/schemas/departure-pickups";

export type PassengerDraft = { passenger_name: string; passenger_phone: string; emergency_contact: string; health_declaration: boolean; pickup_key: string };
export type PassengerErrors = Partial<Record<keyof PassengerDraft, string>>;
export type CheckoutPickup = { key: string; name: string; address: string; pickup_time?: string; dep_pickup_id?: number };
export type DeparturePickupSource = DeparturePickupsDto;
export type HoldAttempt = { fingerprint: string; input: HoldSeatsInput };

const passengerSchema = holdSeatsSchema.shape.seats.element.omit({ dep_seat_id: true, dep_pickup_id: true });
const fieldMessages: Record<Exclude<keyof PassengerDraft, "pickup_key">, string> = {
  passenger_name: "Nhập họ tên hợp lệ, tối đa 100 ký tự, không dùng ký tự < hoặc >.",
  passenger_phone: "Nhập số điện thoại gồm 9–15 chữ số, có thể bắt đầu bằng +.",
  emergency_contact: "Nhập người liên hệ và số điện thoại khẩn cấp, tối đa 150 ký tự.",
  health_declaration: "Vui lòng xác nhận cam kết sức khỏe cho hành khách này.",
};

export function validatePassengerDraft(draft: PassengerDraft, pickups: CheckoutPickup[]): PassengerErrors {
  const { pickup_key, ...fields } = draft;
  const result = passengerSchema.safeParse(fields);
  const errors: PassengerErrors = {};
  if (!result.success) for (const issue of result.error.issues) {
    const field = issue.path[0] as Exclude<keyof PassengerDraft, "pickup_key">;
    errors[field] = fieldMessages[field];
  }
  if (!pickups.some(pickup => pickup.key === pickup_key)) errors.pickup_key = "Vui lòng chọn một điểm đón trong danh sách hiện tại.";
  return errors;
}

export function buildHoldInput(passengers: { seat_id: number; draft: PassengerDraft }[], pickups: CheckoutPickup[], key: string): HoldSeatsInput | null {
  const seats = [];
  for (const { seat_id, draft } of passengers) {
    if (Object.keys(validatePassengerDraft(draft, pickups)).length) return null;
    const pickup = pickups.find(item => item.key === draft.pickup_key);
    // Catalog pickup IDs are deliberately never accepted as departure pickup IDs.
    if (!pickup?.dep_pickup_id) return null;
    seats.push({ dep_seat_id: seat_id, dep_pickup_id: pickup.dep_pickup_id,
      passenger_name: draft.passenger_name, passenger_phone: draft.passenger_phone,
      emergency_contact: draft.emergency_contact, health_declaration: draft.health_declaration });
  }
  const result = holdSeatsSchema.safeParse({ idempotency_key: key, seats: seats.sort((a, b) => a.dep_seat_id - b.dep_seat_id) });
  return result.success ? result.data : null;
}

export function holdAttempt(previous: HoldAttempt | null, input: HoldSeatsInput, createKey: () => string): HoldAttempt {
  const fingerprint = JSON.stringify(input.seats);
  return previous?.fingerprint === fingerprint ? previous : {
    fingerprint, input: { ...input, idempotency_key: createKey() },
  };
}

export function emptyPassengerDraft(): PassengerDraft {
  return { passenger_name: "", passenger_phone: "", emergency_contact: "", health_declaration: false, pickup_key: "" };
}
