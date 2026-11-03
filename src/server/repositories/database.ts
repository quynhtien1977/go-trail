import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type Database = PrismaClient;
export type Transaction = Prisma.TransactionClient;
export type DataClient = Database | Transaction;

// Services choose the unit of work; repositories execute all operations on this client.
export function inTransaction<T>(
  db: Database,
  work: (tx: Transaction) => Promise<T>,
  options?: { isolationLevel: "RepeatableRead" },
) {
  return db.$transaction(work, options);
}
