import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/schemas/auth";
import { AppError } from "@/server/errors";
import { findIdentity } from "@/server/repositories/accounts";

export type Actor = { user_id: number; role: Role; auth_version: number };
export type AuthDatabase = PrismaClient | Prisma.TransactionClient;
export type SessionIdentity = { user_id: number; auth_version: number };

export async function requireActor(db: AuthDatabase, identity: SessionIdentity | null): Promise<Actor> {
  if (!identity || !Number.isSafeInteger(identity.user_id) || identity.user_id < 1
    || !Number.isSafeInteger(identity.auth_version) || identity.auth_version < 0) {
    throw new AppError("UNAUTHENTICATED", 401);
  }
  const user = await findIdentity(db, identity.user_id);
  if (!user || user.status !== "Active" || user.auth_version !== identity.auth_version) {
    throw new AppError("UNAUTHENTICATED", 401);
  }
  return { user_id: user.user_id, role: user.role, auth_version: user.auth_version };
}

export function requireRole(actor: Actor, roles: readonly Role[]): void {
  if (actor.role !== "Admin" && !roles.includes(actor.role)) throw new AppError("FORBIDDEN", 403);
}

export { canAccessRouteGroup } from "./route-policy";
