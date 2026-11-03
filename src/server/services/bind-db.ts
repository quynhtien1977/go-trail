import "server-only";
import { getDb } from "@/server/db";
import type { Database } from "@/server/repositories/database";

type Bound<T> = { [K in keyof T]: T[K] extends (db: Database, ...args: infer A) => infer R ? (...args: A) => R : never };

// Presentation calls services through these bindings, so it never acquires the database itself.
// Tests keep calling the db-first functions with their own database.
export function bindDb<T extends Record<string, (db: Database, ...args: never[]) => unknown>>(services: T): Bound<T> {
  return Object.fromEntries(Object.entries(services).map(([name, service]) =>
    [name, (...args: never[]) => service(getDb(), ...args)])) as Bound<T>;
}
