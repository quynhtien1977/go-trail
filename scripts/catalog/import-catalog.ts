import { loadEnvConfig } from "@next/env";
import pg from "pg";
import { assertCatalogTarget, CatalogValidationError, readReviewedCatalog } from "../../prisma/catalog";
import { importCatalogRows, type CatalogQuery } from "../../prisma/catalog-importer";

loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--apply", "--dry-run"].includes(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) {
    throw new CatalogValidationError("Usage: npm run db:catalog -- [--dry-run | --apply]. Default is dry-run.");
  }
  if (process.env.NODE_ENV === "production") throw new CatalogValidationError("Reference catalog import is disabled in production.");
  const connectionString = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new CatalogValidationError("DIRECT_URL or DATABASE_URL is required.");
  assertCatalogTarget(connectionString);
  const entries = await readReviewedCatalog();
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000, application_name: "go-trail-catalog-import" });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const query: CatalogQuery = async <T>(sql: string, parameters?: unknown[]) => (await client.query(sql, parameters)).rows as T[];
    const counts = await importCatalogRows(query, entries);
    const apply = args.includes("--apply");
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(`${apply ? "Applied" : "Dry-run rolled back"}: ${JSON.stringify(counts)}`);
    console.log("No real departures, invoices, seats, payments or credentials were created/changed. Dry-run may advance PostgreSQL sequences.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof CatalogValidationError ? error.message : "Catalog import failed; database details suppressed.");
  process.exitCode = 1;
});
