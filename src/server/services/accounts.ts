import "server-only";
import { compare, hash } from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import { accountAccessSchema, credentialsSchema, registrationSchema } from "@/schemas/auth";
import { requireActor, requireRole, type Actor } from "@/server/auth/authorization";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";

const publicUser = { user_id: true, email: true, full_name: true, phone: true, role: true, status: true } as const;
const dummyHash = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5PVdlXjrUdmqu89noDeJtdoqYnFwNZe";

export async function registerCustomer(db: PrismaClient, input: unknown) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  const { password, ...profile } = parsed.data;
  const password_hash = await hash(password, 12);
  try {
    return await db.user.create({ data: { ...profile, password_hash, role: "Customer", status: "Active" }, select: publicUser });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new AppError("REGISTRATION_UNAVAILABLE", 409);
    }
    throw error;
  }
}

export async function authenticateCredentials(db: PrismaClient, input: unknown, secret: string, trustedClientIp?: string) {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return null;
  if (trustedClientIp) {
    const source = await consumeRateLimit("login-source", trustedClientIp, secret, 50);
    if (!source.allowed) return null;
  }
  const limit = await consumeRateLimit("login-email", parsed.data.email, secret, 10);
  if (!limit.allowed) return null;
  const user = await db.user.findUnique({ where: { email: parsed.data.email },
    select: { ...publicUser, password_hash: true, auth_version: true } });
  const valid = await compare(parsed.data.password, user?.password_hash ?? dummyHash);
  if (!user || user.status !== "Active" || !valid) return null;
  // Recheck after the expensive hash operation; a concurrent lock must not create a session.
  const actor = await requireActor(db, user).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") return null;
    throw error;
  });
  if (!actor) return null;
  return { user_id: user.user_id, email: user.email, full_name: user.full_name,
    role: actor.role, auth_version: actor.auth_version };
}

export async function updateAccountAccess(db: PrismaClient, identity: Actor, userId: number, input: unknown) {
  const parsed = accountAccessSchema.safeParse(input);
  if (!parsed.success || !Number.isInteger(userId) || userId < 1 || userId > 2147483647) {
    throw new AppError("INVALID_INPUT", 422);
  }
  return db.$transaction(async (tx) => {
    // Serializes access changes so two Admins cannot concurrently remove the last active Admin.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(717002)::text`;
    const actor = await requireActor(tx, identity);
    requireRole(actor, []);
    const current = await tx.user.findUnique({ where: { user_id: userId }, include: { staff: true } });
    if (!current) throw new AppError("NOT_FOUND", 404);
    const role = parsed.data.role ?? current.role;
    const status = parsed.data.status ?? current.status;
    if ((role === "Leader") !== Boolean(current.staff)) throw new AppError("ACCESS_CONFLICT", 409);
    if (current.role === "Admin" && current.status === "Active" && (role !== "Admin" || status !== "Active")
      && await tx.user.count({ where: { role: "Admin", status: "Active" } }) <= 1) {
      throw new AppError("ACCESS_CONFLICT", 409);
    }
    const changedRole = role !== current.role;
    const changedStatus = status !== current.status;
    if (!changedRole && !changedStatus) {
      return tx.user.findUniqueOrThrow({ where: { user_id: userId }, select: publicUser });
    }
    const updated = await tx.user.update({ where: { user_id: userId },
      data: { role, status, auth_version: { increment: 1 } }, select: publicUser });
    if (changedRole) await writeAudit(tx, actor.user_id, { action: "RoleChanged", record_id: userId, from: current.role, to: role });
    if (changedStatus) await writeAudit(tx, actor.user_id, { action: "AccountStatusChanged", record_id: userId, from: current.status, to: status });
    return updated;
  });
}
