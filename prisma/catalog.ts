import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export class CatalogValidationError extends Error {}

export type CatalogEntry = {
  source_url: string;
  fetched_at: string;
  trip: {
    name: string; city: string; district: string | null; location_name: string;
    difficulty_level: string | null; length_km: string; peak_height_m: number | null;
    base_price: string; description: string; schedule_content: string;
  };
  pickups: { name: string; address: string }[];
};

function requireValue(valid: unknown, message: string): asserts valid {
  if (!valid) throw new CatalogValidationError(message);
}

function object(value: unknown): Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value), "Invalid catalog object.");
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  requireValue(typeof value === "string" && value.trim().length > 0 && value.length <= 10000
    && !/<[^>]*>/.test(value) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), "Invalid catalog text.");
  return value;
}

function money(value: unknown): string {
  requireValue(typeof value === "string" && /^(0|[1-9]\d{0,13})$/.test(value), "Invalid integer VND amount.");
  return value;
}

export function validateReviewedCatalog(input: unknown, approval: unknown): CatalogEntry[] {
  const catalog = object(input);
  const review = object(approval);
  requireValue(catalog.schema_version === 1 && review.schema_version === 1, "Unsupported catalog version.");
  requireValue(createHash("sha256").update(JSON.stringify(input)).digest("hex") === review.catalog_sha256,
    "Catalog changed since review; review the new snapshot before importing.");
  requireValue(Array.isArray(catalog.items) && catalog.items.length > 0 && catalog.items.length <= 100
    && Array.isArray(review.items) && review.items.length === catalog.items.length, "Invalid review coverage.");
  const decisions = new Map<string, Record<string, unknown>>();
  for (const value of review.items) {
    const decision = object(value);
    const url = text(decision.source_url);
    requireValue(!decisions.has(url), "Duplicate review URL.");
    decisions.set(url, decision);
  }
  const seen = new Set<string>();
  return catalog.items.map((value) => {
    const item = object(value);
    const source_url = text(item.source_url);
    requireValue(/^https:\/\/gotrail\.vn\/bus\/[a-z0-9-]+\/$/.test(source_url) && !seen.has(source_url), "Invalid or duplicate source URL.");
    seen.add(source_url);
    const decision = decisions.get(source_url);
    requireValue(decision, "Missing reviewed source.");
    const fetched_at = text(item.fetched_at);
    requireValue(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(fetched_at)
      && Number.isFinite(Date.parse(fetched_at)), "Invalid UTC source timestamp.");
    requireValue(["ready_for_review", "needs_review"].includes(String(item.review_status)), "Invalid review status.");
    const trip = object(item.trip);
    const ticket = object(item.ticket);
    requireValue(ticket.includes_bus === true && ticket.includes_leader === true && ticket.candidate_price_kind === "displayed",
      "Only the Bus + Leader package is supported by this import.");
    requireValue(money(trip.base_price) === money(ticket.displayed_price_vnd), "Snapshot price mapping is inconsistent.");
    requireValue(typeof trip.length_km === "string" && /^\d{1,6}(\.\d{1,2})?$/.test(trip.length_km), "Invalid distance precision.");
    requireValue(trip.peak_height_m === null || (Number.isInteger(trip.peak_height_m)
      && Number(trip.peak_height_m) >= 0 && Number(trip.peak_height_m) <= 2147483647), "Invalid summit height.");
    requireValue(Array.isArray(item.pickup_points) && Array.isArray(decision.bus_pickup_indexes)
      && decision.bus_pickup_indexes.length > 0, "Missing approved bus pickups.");
    const sourcePickups = item.pickup_points;
    const indexes = new Set<number>();
    const pickupNames = new Set<string>();
    const pickups = decision.bus_pickup_indexes.map((index) => {
      requireValue(Number.isInteger(index) && index >= 0 && index < sourcePickups.length && !indexes.has(index), "Invalid approved pickup index.");
      indexes.add(index);
      const pickup = object(sourcePickups[index]);
      const name = text(pickup.name);
      requireValue(!/nhập\s*hội/i.test(name) && !pickupNames.has(name) && pickup.timezone === "Asia/Ho_Chi_Minh",
        "Invalid bus pickup selection.");
      pickupNames.add(name);
      return { name, address: text(pickup.address) };
    });
    return {
      source_url, fetched_at, pickups,
      trip: {
        name: text(trip.name), city: text(trip.city), district: trip.district === null ? null : text(trip.district),
        location_name: text(trip.location_name), difficulty_level: trip.difficulty_level === null ? null : text(trip.difficulty_level),
        length_km: trip.length_km, peak_height_m: trip.peak_height_m as number | null,
        base_price: money(decision.base_price), description: text(trip.description),
        schedule_content: text(decision.schedule_content ?? trip.schedule_content),
      },
    };
  });
}

export async function readReviewedCatalog(): Promise<CatalogEntry[]> {
  const [catalog, review] = await Promise.all([
    readFile(new URL("../data/reference/gotrail/catalog.json", import.meta.url), "utf8"),
    readFile(new URL("../data/reference/gotrail/import-review.json", import.meta.url), "utf8"),
  ]);
  return validateReviewedCatalog(JSON.parse(catalog), JSON.parse(review));
}

export function assertCatalogTarget(connectionString: string): void {
  let url: URL;
  try { url = new URL(connectionString); } catch { throw new CatalogValidationError("Invalid database URL; details suppressed."); }
  // pg-connection-string lets query parameters override hostname/user from the URL.
  const allowedParameters = new Set(["sslmode", "pgbouncer", "connection_limit", "pool_timeout", "connect_timeout"]);
  requireValue([...url.searchParams.keys()].every((key) => allowedParameters.has(key)),
    "Unsupported connection parameters; target overrides are not allowed for catalog writes.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const direct = /^db\.[a-z]{20}\.supabase\.co$/.test(url.hostname);
  const pooler = url.hostname.endsWith(".pooler.supabase.com") && /^postgres\.[a-z]{20}$/.test(decodeURIComponent(url.username));
  requireValue(["postgres:", "postgresql:"].includes(url.protocol) && (local || direct || pooler),
    "Catalog writes require a local PostgreSQL or Supabase PostgreSQL URL from the development environment.");
}
