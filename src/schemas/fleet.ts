import { z } from "zod";
import { pageQuerySchema, singleLine } from "./catalog";

export const vehicleStatuses = ["Ready", "Maintenance", "Inactive"] as const;
const plate = z.string().trim().toUpperCase().regex(/^[0-9A-Z][0-9A-Z.-]{3,14}$/);
const seatName = singleLine(10).transform((value) => value.toUpperCase());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value));
const nonEmpty = (value: object) => Object.values(value).some((item) => item !== undefined);

const seatFields = {
  seat_name: seatName, floor_level: z.number().int().min(1).max(2),
  x_position: z.number().int().min(0).max(20), y_position: z.number().int().min(0).max(30),
};
export const createSeatSchema = z.strictObject(seatFields);
export const updateSeatSchema = createSeatSchema.extend({ is_active: z.boolean() }).partial().refine(nonEmpty);

export const createVehicleSchema = z.strictObject({
  plate_number: plate, vehicle_type: singleLine(50),
  seats: z.array(createSeatSchema).min(1).max(80)
    .refine((seats) => new Set(seats.map((seat) => seat.seat_name)).size === seats.length)
    .refine((seats) => new Set(seats.map((seat) => `${seat.floor_level}:${seat.x_position}:${seat.y_position}`)).size === seats.length),
});
export const updateVehicleSchema = z.strictObject({
  plate_number: plate, vehicle_type: singleLine(50), status: z.enum(vehicleStatuses),
}).partial().refine(nonEmpty);
export const createMaintenanceSchema = z.strictObject({
  start_date: date, end_date: date, description: singleLine(500), cost: z.string().regex(/^(0|[1-9]\d{0,13})$/),
}).refine((value) => value.end_date >= value.start_date);
export const vehicleQuerySchema = pageQuerySchema.extend({ status: z.enum(vehicleStatuses).optional() });

export type SeatDto = { seat_id: number; vehicle_id: number; seat_name: string; floor_level: number;
  x_position: number; y_position: number; is_active: boolean };
export type VehicleSummaryDto = { vehicle_id: number; plate_number: string; vehicle_type: string;
  seat_count: number; status: (typeof vehicleStatuses)[number] };
export type VehicleDto = VehicleSummaryDto & { seats: SeatDto[] };
export type MaintenanceDto = { maintenance_id: number; vehicle_id: number; start_date: string; end_date: string;
  description: string; cost: string };
