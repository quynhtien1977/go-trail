import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/schemas/auth";

export type AccountDatabase = PrismaClient | Prisma.TransactionClient;
const publicUser = { user_id: true, email: true, full_name: true, phone: true, role: true, status: true } as const;

export function findCredentialUser(db: AccountDatabase, email: string) {
  return db.user.findUnique({ where: { email }, select: { ...publicUser, password_hash: true, auth_version: true } });
}
export function findIdentity(db: AccountDatabase, user_id: number) {
  return db.user.findUnique({ where: { user_id }, select: { user_id: true, role: true, status: true, auth_version: true } });
}
export function readProfile(db: AccountDatabase, user_id: number) {
  return db.user.findUniqueOrThrow({ where: { user_id }, select: publicUser });
}
export function readPortalProfile(db: AccountDatabase, user_id: number) {
  return db.user.findUniqueOrThrow({ where: { user_id }, select: { ...publicUser, created_at: true } });
}
export async function readAdminOverview(db: AccountDatabase) {
  const [usersCount, recentUsers, settings] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: { user_id: true } }),
    db.user.findMany({ take: 10, orderBy: { user_id: "desc" },
      select: { user_id: true, email: true, full_name: true, role: true, status: true, created_at: true } }),
    db.systemSetting.findMany({ select: { setting_key: true, setting_value: true, description: true } }),
  ]);
  return { usersCount, recentUsers, settings };
}
export async function insertCustomer(db: AccountDatabase, data: { email: string; password_hash: string; full_name: string; phone: string }) {
  try {
    return await db.user.create({ data: { ...data, role: "Customer", status: "Active" }, select: publicUser });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return null;
    throw error;
  }
}
export function withAccountAccessTransaction<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(717002)::text`;
    return work(tx);
  });
}
export function findAccountWithStaff(db: AccountDatabase, user_id: number) {
  return db.user.findUnique({ where: { user_id }, include: { staff: true } });
}
export function countActiveAdmins(db: AccountDatabase) {
  return db.user.count({ where: { role: "Admin", status: "Active" } });
}
export function changeAccountAccess(db: AccountDatabase, user_id: number, role: Role, status: "Active" | "Locked") {
  return db.user.update({ where: { user_id }, data: { role, status, auth_version: { increment: 1 } }, select: publicUser });
}
