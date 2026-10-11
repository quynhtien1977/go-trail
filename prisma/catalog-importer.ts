import { CatalogValidationError, type CatalogEntry } from "./catalog";

// A parameterized PostgreSQL query on ONE connection, inside the caller's transaction.
export type CatalogQuery = <T>(sql: string, parameters?: unknown[]) => Promise<T[]>;
type TripRow = { trip_id: number; name: string; location_name: string; source_url: string | null };
type PickupRow = { pickup_id: number; name: string; address: string; is_active: boolean };

const legacyDemo = [
  { name: "[Demo] Trekking Núi Bà Đen", location: "Núi Bà Đen", price: "750000", length: "8.5", height: 986,
    city: "Tây Ninh", district: "Khu vực Núi Bà Đen", difficulty: "Trung bình", dates: ["2030-01-05T22:00:00.000Z", "2030-01-12T22:00:00.000Z"], statuses: ["Draft", "Open"] },
  { name: "[Demo] Trekking Núi Chứa Chan", location: "Núi Chứa Chan", price: "650000", length: "6.0", height: 837,
    city: "Đồng Nai", district: "Khu vực Xuân Lộc", difficulty: "Dễ", dates: ["2030-01-19T22:00:00.000Z"], statuses: ["Closed"] },
];

async function guardDemo(query: CatalogQuery, trip: TripRow, entry: CatalogEntry) {
  const legacy = legacyDemo.find((row) => row.name === trip.name && row.location === entry.trip.location_name);
  if (!legacy) throw new CatalogValidationError("Unrecognized demo catalog; import stopped.");
  const unchanged = await query<{ trip_id: number }>(`SELECT trip_id FROM trips WHERE trip_id = $1
    AND city = $2 AND district = $3 AND difficulty_level = $4 AND length_km = $5
    AND peak_height_m = $6 AND base_price = $7 AND source_url IS NULL
    AND description = $8 AND schedule_content = $9`, [trip.trip_id, legacy.city, legacy.district,
    legacy.difficulty, legacy.length, legacy.height, legacy.price,
    "Dữ liệu demo phục vụ phát triển, không phải tour đang bán.", "Đón khách → di chuyển → trekking cùng Leader → trở về điểm đón."]);
  if (!unchanged.length) throw new CatalogValidationError("Demo trip was edited; import stopped to preserve changes.");
  const [activity] = await query<{ used: boolean }>(`SELECT (
    EXISTS(SELECT 1 FROM invoices i JOIN departures d USING(departure_id) WHERE d.trip_id = $1)
    OR EXISTS(SELECT 1 FROM departure_costs c JOIN departures d USING(departure_id) WHERE d.trip_id = $1)
    OR EXISTS(SELECT 1 FROM departure_seats s JOIN departure_vehicles v USING(dep_vehicle_id)
      JOIN departures d USING(departure_id) WHERE d.trip_id = $1 AND s.status <> 'Available')
  ) AS used`, [trip.trip_id]);
  if (activity.used) throw new CatalogValidationError("Demo catalog has booking or financial activity; import stopped.");
  const departures = await query<{ departure_date: Date | string; status: string; min_passengers: number; price_override: string | null }>(
    "SELECT departure_date, status, min_passengers, price_override FROM departures WHERE trip_id = $1 ORDER BY departure_date", [trip.trip_id]);
  if (departures.length !== legacy.dates.length || new Set(departures.map((row) => new Date(row.departure_date).toISOString())).size !== departures.length || departures.some((row) => {
    const index = legacy.dates.indexOf(new Date(row.departure_date).toISOString());
    return index < 0 || row.status !== legacy.statuses[index] || row.min_passengers !== 6 || row.price_override !== null;
  })) throw new CatalogValidationError("Demo departures were edited; import stopped.");
  const pickups = await query<PickupRow>("SELECT pickup_id, name, address, is_active FROM pickup_points WHERE trip_id = $1 ORDER BY pickup_id", [trip.trip_id]);
  if (pickups.length !== 2 || new Set(pickups.map((row) => row.name)).size !== pickups.length || pickups.some((row) =>
    !["Điểm đón trung tâm", "Điểm đón phía Đông"].includes(row.name) || !row.is_active || row.address !== "Địa chỉ demo tại TP. Hồ Chí Minh")) {
    throw new CatalogValidationError("Demo pickups were edited; import stopped.");
  }
  return pickups;
}

export async function importCatalogRows(query: CatalogQuery, entries: CatalogEntry[]) {
  // Same lock as the development seed. Table locks also exclude booking/admin writes during replacement.
  await query("SELECT pg_advisory_xact_lock(717001)::text");
  await query(`LOCK TABLE trips, pickup_points, departures, departure_pickups,
    invoices, departure_costs, departure_seats IN SHARE ROW EXCLUSIVE MODE`);
  const counts = { created_trips: 0, replaced_demo_trips: 0, preserved_trips: 0, created_pickups: 0, replaced_pickups: 0, retired_pickups: 0 };
  for (const entry of entries) {
    const existing = await query<TripRow>("SELECT trip_id, name, location_name, source_url FROM trips WHERE source_url = $1", [entry.source_url]);
    // Re-import never overwrites subsequent admin edits, prices, pickups or departures.
    if (existing.length) { counts.preserved_trips++; continue; }
    const candidates = await query<TripRow>("SELECT trip_id, name, location_name, source_url FROM trips WHERE name = $1 AND location_name = $2", [
      `[Demo] ${entry.trip.name}`, entry.trip.location_name,
    ]);
    if (candidates.length > 1) throw new CatalogValidationError("Duplicate demo trips; import stopped.");
    const demo = candidates[0];
    const oldPickups = demo ? await guardDemo(query, demo, entry) : [];
    if (!demo) {
      const collision = await query<TripRow>("SELECT trip_id FROM trips WHERE name = $1 AND location_name = $2", [entry.trip.name, entry.trip.location_name]);
      if (collision.length) throw new CatalogValidationError("A manual trip matches this source; reconcile it before importing.");
    }
    const t = entry.trip;
    const values = [t.name, t.city, t.district, t.location_name, t.difficulty_level, t.length_km,
      t.peak_height_m, t.base_price, t.description, t.schedule_content, entry.source_url, new Date(entry.fetched_at)];
    const [trip] = demo
      ? await query<TripRow>(`UPDATE trips SET name=$1, city=$2, district=$3, location_name=$4,
          difficulty_level=$5, length_km=$6, peak_height_m=$7, base_price=$8, description=$9,
          schedule_content=$10, source_url=$11, source_fetched_at=$12 WHERE trip_id=$13 RETURNING trip_id`, [...values, demo.trip_id])
      : await query<TripRow>(`INSERT INTO trips(name, city, district, location_name, difficulty_level,
          length_km, peak_height_m, base_price, description, schedule_content, source_url, source_fetched_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING trip_id`, values);
    if (demo) {
      counts.replaced_demo_trips++;
      await query("UPDATE departures SET is_demo=true WHERE trip_id=$1", [trip.trip_id]);
    } else counts.created_trips++;
    for (const [index, pickup] of entry.pickups.entries()) {
      const old = oldPickups.find((row) => row.name === (index === 0 ? "Điểm đón trung tâm" : "Điểm đón phía Đông"));
      if (old) {
        await query("UPDATE pickup_points SET name=$1, address=$2, is_active=true WHERE pickup_id=$3", [pickup.name, pickup.address, old.pickup_id]);
        counts.replaced_pickups++;
      } else {
        await query("INSERT INTO pickup_points(trip_id, name, address) VALUES($1,$2,$3) RETURNING pickup_id", [trip.trip_id, pickup.name, pickup.address]);
        counts.created_pickups++;
      }
    }
    if (entry.pickups.length === 1) {
      const retired = oldPickups.find((row) => row.name === "Điểm đón phía Đông");
      if (retired) {
        await query("UPDATE pickup_points SET is_active=false WHERE pickup_id=$1", [retired.pickup_id]);
        counts.retired_pickups++;
      }
    }
  }
  return counts;
}
