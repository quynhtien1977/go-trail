import type { DefaultSession } from "next-auth";
import type { Role } from "@/schemas/auth";

declare module "next-auth" {
  interface User { role: Role; auth_version: number }
  interface Session {
    user: NonNullable<DefaultSession["user"]> & { user_id: number; role: Role; auth_version: number };
  }
}
declare module "next-auth/jwt" {
  interface JWT { role?: Role; auth_version?: number; authenticated_at?: number }
}
