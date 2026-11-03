import type { SeatMapDto } from "@/schemas/seat-map";
import type { InvoiceDto } from "@/schemas/invoice";

export type MapSeat = SeatMapDto["vehicles"][number]["seats"][number];
export type SeatFloor = { level: number; columns: number; rows: number; seats: { seat: MapSeat; column: number; row: number }[] };

export function seatFloors(seats: MapSeat[]): SeatFloor[] {
  const levels = [...new Set(seats.map(seat => seat.floor_level))].sort((a, b) => a - b);
  return levels.map(level => {
    const floor = seats.filter(seat => seat.floor_level === level)
      .sort((a, b) => a.y_position - b.y_position || a.x_position - b.x_position);
    return {
      level,
      columns: Math.max(...floor.map(seat => seat.x_position)) + 1,
      rows: Math.max(...floor.map(seat => seat.y_position)) + 1,
      seats: floor.map(seat => ({ seat, column: seat.x_position + 1, row: seat.y_position + 1 })),
    };
  });
}

export function availableSelection(map: SeatMapDto, selected: number[]): number[] {
  const available = new Set(map.vehicles.flatMap(vehicle => vehicle.seats
    .filter(seat => seat.status === "Available").map(seat => seat.dep_seat_id)));
  return [...new Set(selected)].filter(id => available.has(id));
}

// Display only. Reaching zero never changes the invoice or releases seats.
export function remainingInvoiceSeconds(invoice: Pick<InvoiceDto, "expires_at" | "server_time">, elapsedMs: number): number {
  const remaining = Date.parse(invoice.expires_at) - Date.parse(invoice.server_time) - Math.max(0, elapsedMs);
  return Number.isFinite(remaining) ? Math.max(0, Math.ceil(remaining / 1000)) : 0;
}
