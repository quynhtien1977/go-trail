import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";

// Entirely isolated: never loads .env or uses DATABASE_URL.
export async function createTestDatabase() {
  const sql = await PGlite.create();
  const names = await readdir(new URL("../../prisma/migrations/", import.meta.url));
  for (const name of names.filter((value) => /^\d+_/.test(value)).sort()) {
    await sql.exec(await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8"));
  }
  // pg replaces a pooled connection after a SQL error; allow the old socket to drain.
  const server = new PGLiteSocketServer({ db: sql, host: "127.0.0.1", port: 0, maxConnections: 10 });
  await server.start();
  const connectionString = `postgresql://postgres@${server.getServerConn()}/postgres`;
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 1,
      connectionTimeoutMillis: 5000 }),
  });
  return { client, sql, connectionString,
    async close() { await client.$disconnect(); await server.stop(); await sql.close(); } };
}
