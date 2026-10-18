import { z } from "zod";

const id = z.number().int().positive().max(2147483647);
export const assignVehicleSchema = z.strictObject({ vehicle_id: id });
export const assignStaffSchema = z.strictObject({ staff_id: id, vehicle_id: id,
  role_in_trip: z.enum(["Driver", "Assistant", "Leader"]) });

export type AssignmentDto = {
  departure_id: number; status: string;
  vehicles: { dep_vehicle_id: number; vehicle_id: number; plate_number: string; seat_count: number; generated_seats: number;
    staff: { dep_staff_id: number; staff_id: number; full_name: string; role_in_trip: "Driver" | "Assistant" | "Leader" }[] }[];
};
