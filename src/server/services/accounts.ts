import "server-only";
import { compare, hash } from "bcryptjs";
import type { Database } from "@/server/repositories/database";
import { accountAccessSchema, credentialsSchema, registrationSchema } from "@/schemas/auth";
import { requireActor, requireRole, type Actor } from "@/server/auth/authorization";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { canLoginAtGate, type LoginGate } from "@/lib/auth-portal";
import { bindDb } from "./bind-db";
import { findCredentialUser, insertCustomer, readProfile, withAccountAccessTransaction,
  findAccountWithStaff, countActiveAdmins, changeAccountAccess, readPortalProfile, readAdminOverview } from "@/server/repositories/accounts";

const dummyHash = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5PVdlXjrUdmqu89noDeJtdoqYnFwNZe";

export async function registerCustomer(db: Database, input: unknown) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  const { password, ...profile } = parsed.data;
  const password_hash = await hash(password, 12);
  const user = await insertCustomer(db, { ...profile, password_hash });
  if (!user) throw new AppError("REGISTRATION_UNAVAILABLE", 409);
  return user;
}

export async function authenticateCredentials(db: Database, input: unknown, secret: string, trustedClientIp?: string, gate: LoginGate = "customer") {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return null;
  if (trustedClientIp) {
    const source = await consumeRateLimit("login-source", trustedClientIp, secret, 50);
    if (!source.allowed) return null;
  }
  const limit = await consumeRateLimit("login-email", parsed.data.email, secret, 10);
  if (!limit.allowed) return null;
  const user = await findCredentialUser(db, parsed.data.email);
  const valid = await compare(parsed.data.password, user?.password_hash ?? dummyHash);
  if (!user || user.status !== "Active" || !valid) return null;
  // Recheck after the expensive hash operation; a concurrent lock must not create a session.
  const actor = await requireActor(db, user).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") return null;
    throw error;
  });
  if (!actor || !canLoginAtGate(actor.role, gate)) return null;
  return { user_id: user.user_id, email: user.email, full_name: user.full_name,
    role: actor.role, auth_version: actor.auth_version };
}

export async function updateAccountAccess(db: Database, identity: Actor, userId: number, input: unknown) {
  const parsed = accountAccessSchema.safeParse(input);
  if (!parsed.success || !Number.isInteger(userId) || userId < 1 || userId > 2147483647) {
    throw new AppError("INVALID_INPUT", 422);
  }
  return withAccountAccessTransaction(db, async (tx) => {
    const actor = await requireActor(tx, identity);
    requireRole(actor, []);
    const current = await findAccountWithStaff(tx, userId);
    if (!current) throw new AppError("NOT_FOUND", 404);
    const role = parsed.data.role ?? current.role;
    const status = parsed.data.status ?? current.status;
    if ((role === "Leader") !== Boolean(current.staff)) throw new AppError("ACCESS_CONFLICT", 409);
    if (current.role === "Admin" && current.status === "Active" && (role !== "Admin" || status !== "Active")
      && await countActiveAdmins(tx) <= 1) {
      throw new AppError("ACCESS_CONFLICT", 409);
    }
    const changedRole = role !== current.role;
    const changedStatus = status !== current.status;
    if (!changedRole && !changedStatus) {
      return readProfile(tx, userId);
    }
    const updated = await changeAccountAccess(tx, userId, role, status);
    if (changedRole) await writeAudit(tx, actor.user_id, { action: "RoleChanged", record_id: userId, from: current.role, to: role });
    if (changedStatus) await writeAudit(tx, actor.user_id, { action: "AccountStatusChanged", record_id: userId, from: current.status, to: status });
    return updated;
  });
}

export async function readCurrentProfile(db: Database, identity: Actor) {
  const actor = await requireActor(db, identity);
  return readProfile(db, actor.user_id);
}

export async function readCurrentPortalProfile(db: Database, identity: Actor) {
  const actor = await requireActor(db, identity);
  return readPortalProfile(db, actor.user_id);
}

export async function readAdminPortal(db: Database, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, []);
  return readAdminOverview(db);
}

export async function registerRateLimitedCustomer(db: Database, input: unknown, secret: string, source?: string) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  if (source && !(await consumeRateLimit("registration-source", source, secret, 50)).allowed) throw new AppError("RATE_LIMITED", 429);
  if (!(await consumeRateLimit("registration-email", parsed.data.email, secret, 3)).allowed) throw new AppError("RATE_LIMITED", 429);
  return registerCustomer(db, parsed.data);
}

export const accountsService = bindDb({ registerRateLimitedCustomer, updateAccountAccess, readCurrentProfile,
  readCurrentPortalProfile, readAdminPortal });
