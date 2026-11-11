import { z } from "zod";
import { registrationSchema } from "./auth";
import { pageQuerySchema, singleLine } from "./catalog";

export const staffTypes = ["Driver", "Assistant", "Leader"] as const;
export const staffStatuses = ["Active", "Inactive"] as const;
const { email, password, full_name, phone } = registrationSchema.shape;
const license = { license_number: singleLine(50).nullish(), license_class: singleLine(20).nullish(), license_expiry: z.iso.date().nullish() };

// Only Leaders get a login (HRMgr creates it with the STAFF record); Drivers and Assistants have no account (PRD 3.1).
export const createStaffSchema = z.strictObject({ full_name, phone, staff_type: z.enum(staffTypes), ...license,
  account: z.strictObject({ email, password }).optional() });
// staff_type is fixed after creation: it decides the Leader account link and every existing assignment.
export const updateStaffSchema = z.strictObject({ full_name, phone, ...license, status: z.enum(staffStatuses) }).partial()
  .refine((value) => Object.values(value).some((item) => item !== undefined));
export const staffQuerySchema = pageQuerySchema.extend({ staff_type: z.enum(staffTypes).optional(), status: z.enum(staffStatuses).optional() });

export type StaffDto = {
  staff_id: number; full_name: string; phone: string; staff_type: (typeof staffTypes)[number];
  license_number: string | null; license_class: string | null; license_expiry: string | null; status: (typeof staffStatuses)[number];
  account: { user_id: number; email: string; status: "Active" | "Locked" } | null;
};
