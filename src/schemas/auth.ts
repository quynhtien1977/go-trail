import { z } from "zod";

export const userRoles = ["Customer", "Leader", "RouteMgr", "HRMgr", "Admin"] as const;
export type Role = (typeof userRoles)[number];
const email = z.string().trim().max(254).toLowerCase().pipe(z.email());
// bcrypt uses bytes, not character count. Password whitespace is significant.
const password = z.string().min(12).max(72)
  .refine((value) => new TextEncoder().encode(value).length <= 72, "Mật khẩu tối đa 72 byte UTF-8.");

export const credentialsSchema = z.strictObject({ email, password: z.string().min(1).max(72)
  .refine((value) => new TextEncoder().encode(value).length <= 72) });
export const registrationSchema = z.strictObject({
  email, password,
  full_name: z.string().trim().min(2).max(100).regex(/^[^\u0000-\u001f\u007f<>]+$/u),
  phone: z.string().trim().regex(/^\+?[0-9]{9,15}$/),
});
export const accountAccessSchema = z.strictObject({
  role: z.enum(userRoles).optional(),
  status: z.enum(["Active", "Locked"]).optional(),
}).refine((value) => value.role !== undefined || value.status !== undefined);

export type RegistrationInput = z.infer<typeof registrationSchema>;
