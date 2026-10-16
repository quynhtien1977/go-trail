import { loadEnvConfig } from "@next/env";
import { writeFile, rename } from "node:fs/promises";
import pg from "pg";
import { assertCatalogTarget } from "../../prisma/catalog";
import { importMediaRows, readMediaSource, readResolvedMedia, mediaDigest, validateResolvedMedia } from "../../prisma/trip-media";
import { createMediaStorage } from "./media-storage";

loadEnvConfig(process.cwd());
function project(value: string) {
  const url = new URL(value);
  return /^db\.([a-z]{20})\.supabase\.co$/.exec(url.hostname)?.[1]
    ?? (url.hostname.endsWith(".pooler.supabase.com") ? /^postgres\.([a-z]{20})$/.exec(decodeURIComponent(url.username))?.[1] : undefined);
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !["--upload", "--apply", "--dry-run"].includes(arg))) throw new Error("Invalid media import mode.");
  if (process.env.NODE_ENV === "production") throw new Error("Reference media import is disabled in production.");
  const connectionString = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("Database configuration missing.");
  assertCatalogTarget(connectionString);
  if (args.includes("--upload")) {
    const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key || new URL(url).hostname !== `${project(connectionString)}.supabase.co`) {
      throw new Error("Storage credentials must match the configured development database project.");
    }
    const runtime = process.env.DATABASE_URL?.trim();
    if (runtime) {
      assertCatalogTarget(runtime);
      if (project(runtime) !== project(connectionString) || new URL(runtime).pathname !== new URL(connectionString).pathname) {
        throw new Error("Runtime and migration database targets differ; upload stopped.");
      }
    }
    const source = await readMediaSource();
    const storage = createMediaStorage(url, key);
    const bucket = await fetch(`${url}/storage/v1/bucket/gotrail-media`, { redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) } });
    if (!bucket.ok || (await bucket.json()).public !== true) throw new Error("Expected existing public gotrail-media bucket.");
    const resolved = [];
    let count = 0;
    for (const trip of source.trips) {
      const media = [];
      for (const row of trip.media) {
        media.push({ ...row, ...await storage.ensure(row.source_url) });
        if (++count % 20 === 0) console.log(`Resolved ${count} media placements.`);
      }
      resolved.push({ trip_source_url: trip.trip_source_url, media });
    }
    const output = { schema_version: 1, source_sha256: mediaDigest(source), storage_base_url: storage.base, trips: resolved };
    validateResolvedMedia(source, output);
    // No partially resolved manifest can replace the last usable dataset.
    const target = new URL("../../data/reference/gotrail/media.json", import.meta.url);
    const temp = new URL(`../../data/reference/gotrail/media.${process.pid}.json.tmp`, import.meta.url);
    await writeFile(temp, `${JSON.stringify(output, null, 2)}\n`);
    await rename(temp, target);
    console.log(`Storage verified: ${source.trips.length} trips, ${count} placements. No database writes.`);
    return;
  }
  const entries = await readResolvedMedia();
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='30s'");
    const counts = await importMediaRows(async <T>(sql: string, values: unknown[] = []) => (await client.query(sql, values)).rows as T[], entries);
    const apply = args.includes("--apply");
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(`${apply ? "Applied" : "Dry-run rolled back"} media: ${JSON.stringify(counts)}`);
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { await client.end(); }
}
main().catch(() => {
  console.error("Media operation failed. Check mode, reviewed manifests, target configuration and Storage access; provider details suppressed.");
  process.exitCode = 1;
});
