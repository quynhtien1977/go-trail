import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { CatalogQuery } from "./catalog-importer";

const plain = z.string().trim().min(1).max(10000).regex(/^[^<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+$/u);
const sourceUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return url.origin === "https://gotrail.vn" && url.pathname.startsWith("/wp-content/uploads/")
    && !url.username && !url.password && !url.search && !url.hash && !/%2f|%5c|%2e/i.test(url.pathname);
});
const tripUrl = z.string().url().regex(/^https:\/\/gotrail\.vn\/bus\/[a-z0-9-]+\/$/);
const placementSchema = z.strictObject({ placement: z.enum(["Cover", "Hero", "Highlight", "Schedule"]),
  sort_order: z.number().int().min(0).max(99), source_url: sourceUrl, alt_text: plain.max(500),
  caption: plain.nullable(), title: plain.max(500).nullable(), body: plain.nullable() });
const sourceSchema = z.strictObject({ schema_version: z.literal(1), trips: z.array(z.strictObject({
  trip_source_url: tripUrl, media: z.array(placementSchema).min(1).max(100),
})).min(1).max(100) });
export type MediaPlacement = z.infer<typeof placementSchema>;
export type MediaSource = z.infer<typeof sourceSchema>;
export type ResolvedMedia = MediaPlacement & { storage_url: string; sha256: string };
export type ResolvedMediaTrip = { trip_source_url: string; media: ResolvedMedia[] };
export function mediaDigest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function check(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(reason); }

export function validateMediaSource(input: unknown): MediaSource["trips"] {
  const result = sourceSchema.parse(input);
  const trips = new Set<string>();
  for (const trip of result.trips) {
    check(!trips.has(trip.trip_source_url), "Duplicate media trip identity."); trips.add(trip.trip_source_url);
    const keys = new Set<string>();
    for (const row of trip.media) {
      const key = `${row.placement}:${row.sort_order}`;
      check(!keys.has(key), "Duplicate media placement."); keys.add(key);
      check(row.placement !== "Cover" || row.sort_order === 0, "Cover order must be zero.");
      check(row.placement === "Highlight" ? !!row.title : row.title === null && row.body === null, "Invalid highlight text.");
    }
  }
  return result.trips;
}
export function storageBase(value: string): string {
  const url = new URL(value);
  check(/^https:\/\/[a-z]{20}\.supabase\.co\/storage\/v1\/object\/public\/gotrail-media$/.test(url.href), "Invalid public media storage base.");
  return url.href;
}
export function validateResolvedMedia(source: unknown, input: unknown): ResolvedMediaTrip[] {
  const trips = validateMediaSource(source);
  const root = z.strictObject({ schema_version: z.literal(1), source_sha256: z.string(), storage_base_url: z.string(),
    trips: z.array(z.strictObject({ trip_source_url: tripUrl, media: z.array(placementSchema.extend({
      sha256: z.string().regex(/^[0-9a-f]{64}$/), storage_path: z.string(),
    })) })) }).parse(input);
  check(root.source_sha256 === mediaDigest(source), "Media source changed since upload; review required.");
  const base = storageBase(root.storage_base_url);
  check(root.trips.length === trips.length, "Incomplete media resolution.");
  return trips.map((trip, index) => {
    const resolved = root.trips[index];
    check(resolved.trip_source_url === trip.trip_source_url && resolved.media.length === trip.media.length, "Media trip mapping mismatch.");
    return { trip_source_url: trip.trip_source_url, media: resolved.media.map((row, i) => {
      const { sha256, storage_path, ...original } = row;
      check(JSON.stringify(original) === JSON.stringify(trip.media[i]), "Media placement mapping mismatch.");
      check(new RegExp(`^trips/assets/${sha256}\\.(jpg|png|webp)$`).test(storage_path), "Invalid media object path.");
      return { ...original, sha256, storage_url: `${base}/${storage_path}` };
    }) };
  });
}
export async function readMediaSource(): Promise<MediaSource> {
  const input = JSON.parse(await readFile(new URL("../data/reference/gotrail/media-source.json", import.meta.url), "utf8"));
  validateMediaSource(input);
  return input;
}
export async function readResolvedMedia() {
  return validateResolvedMedia(await readMediaSource(), JSON.parse(await readFile(new URL("../data/reference/gotrail/media.json", import.meta.url), "utf8")));
}

// Caller owns the transaction. Import is insert-only: edited rows require explicit reconciliation.
export async function importMediaRows(query: CatalogQuery, entries: ResolvedMediaTrip[]) {
  // Same lock and ordering as catalog import/seed, avoiding cross-import deadlocks.
  await query("SELECT pg_advisory_xact_lock(717001)::text");
  const counts = { inserted: 0, existing: 0 };
  for (const trip of entries) {
    const [parent] = await query<{ trip_id: number }>("SELECT trip_id FROM trips WHERE source_url=$1 FOR SHARE", [trip.trip_source_url]);
    check(parent, "Media trip missing; import catalog first.");
    for (const row of trip.media) {
      const values = [parent.trip_id, row.placement, row.sort_order, row.source_url, row.storage_url,
        row.sha256, row.alt_text, row.caption, row.title, row.body];
      const inserted = await query(`INSERT INTO trip_media(trip_id,placement,sort_order,source_url,storage_url,content_sha256,alt_text,caption,title,body)
        VALUES($1,$2::"TripMediaPlacement",$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT(trip_id,placement,sort_order) DO NOTHING RETURNING media_id`, values);
      if (inserted.length) { counts.inserted++; continue; }
      const same = await query(`SELECT media_id FROM trip_media WHERE trip_id=$1 AND placement=$2::"TripMediaPlacement" AND sort_order=$3
        AND source_url=$4 AND storage_url=$5 AND content_sha256=$6 AND alt_text=$7
        AND caption IS NOT DISTINCT FROM $8 AND title IS NOT DISTINCT FROM $9 AND body IS NOT DISTINCT FROM $10`, values);
      check(same.length === 1, "Existing media differs; explicit reconciliation required to preserve edits.");
      counts.existing++;
    }
  }
  return counts;
}
