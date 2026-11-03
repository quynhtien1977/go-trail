import fs from 'fs';

function validate() {
  console.log("=== VALIDATING catalog.json ===");
  const catalogRaw = fs.readFileSync('data/reference/gotrail/catalog.json', 'utf8');
  const catalog = JSON.parse(catalogRaw);

  if (catalog.schema_version !== 1) throw new Error("catalog.schema_version must be 1");
  if (!Array.isArray(catalog.items)) throw new Error("catalog.items must be an array");
  if (catalog.items.length < 5 || catalog.items.length > 8) {
    console.warn(`Warning: items count is ${catalog.items.length} (expected 5-8)`);
  }

  const seenUrls = new Set();

  for (const [idx, item] of catalog.items.entries()) {
    console.log(`Checking item [${idx}] ${item.source_url}...`);
    if (!item.source_url || !item.source_url.startsWith('https://gotrail.vn/bus/')) {
      throw new Error(`Item ${idx} has invalid source_url: ${item.source_url}`);
    }
    if (seenUrls.has(item.source_url)) {
      throw new Error(`Duplicate source_url: ${item.source_url}`);
    }
    seenUrls.add(item.source_url);

    if (!item.fetched_at || !item.fetched_at.endsWith('Z')) {
      throw new Error(`Item ${idx} fetched_at must be ISO 8601 with Z`);
    }
    if (typeof item.source_title !== 'string') throw new Error(`Item ${idx} source_title invalid`);

    // Check trip
    const t = item.trip;
    if (!t) throw new Error(`Item ${idx} missing trip object`);
    if (typeof t.name !== 'string' || !t.name) throw new Error(`Item ${idx} trip.name invalid`);
    if (typeof t.city !== 'string' || !t.city) throw new Error(`Item ${idx} trip.city invalid`);
    if (t.district !== null && typeof t.district !== 'string') throw new Error(`Item ${idx} trip.district invalid`);
    if (typeof t.location_name !== 'string' || !t.location_name) throw new Error(`Item ${idx} trip.location_name invalid`);
    if (t.difficulty_level !== null && typeof t.difficulty_level !== 'string') throw new Error(`Item ${idx} trip.difficulty_level invalid`);
    if (typeof t.length_km !== 'string' || !/^[0-9]+(\.[0-9]+)?$/.test(t.length_km)) {
      throw new Error(`Item ${idx} trip.length_km must be string decimal`);
    }
    if (t.peak_height_m !== null && (!Number.isInteger(t.peak_height_m) || t.peak_height_m < 0)) {
      throw new Error(`Item ${idx} trip.peak_height_m must be non-negative integer or null`);
    }
    if (t.base_price !== null && (typeof t.base_price !== 'string' || !/^[0-9]+$/.test(t.base_price))) {
      throw new Error(`Item ${idx} trip.base_price must be string integer VND or null`);
    }
    if (typeof t.description !== 'string' || /<[a-z][\s\S]*>/i.test(t.description)) {
      throw new Error(`Item ${idx} trip.description contains HTML or is invalid`);
    }
    if (typeof t.schedule_content !== 'string' || /<[a-z][\s\S]*>/i.test(t.schedule_content)) {
      throw new Error(`Item ${idx} trip.schedule_content contains HTML or is invalid`);
    }

    // Check ticket
    const tk = item.ticket;
    if (!tk) throw new Error(`Item ${idx} missing ticket object`);
    if (tk.label !== null && typeof tk.label !== 'string') throw new Error(`Item ${idx} ticket.label invalid`);
    if (tk.includes_bus !== null && typeof tk.includes_bus !== 'boolean') throw new Error(`Item ${idx} ticket.includes_bus invalid`);
    if (tk.includes_leader !== null && typeof tk.includes_leader !== 'boolean') throw new Error(`Item ${idx} ticket.includes_leader invalid`);
    if (tk.regular_price_vnd !== null && typeof tk.regular_price_vnd !== 'string') throw new Error(`Item ${idx} ticket.regular_price_vnd invalid`);
    if (tk.displayed_price_vnd !== null && typeof tk.displayed_price_vnd !== 'string') throw new Error(`Item ${idx} ticket.displayed_price_vnd invalid`);
    if (!['regular', 'displayed', null].includes(tk.candidate_price_kind)) {
      throw new Error(`Item ${idx} ticket.candidate_price_kind invalid`);
    }

    // Check pickup points
    if (!Array.isArray(item.pickup_points)) throw new Error(`Item ${idx} pickup_points must be array`);
    for (const [pIdx, p] of item.pickup_points.entries()) {
      if (p.name !== null && typeof p.name !== 'string') throw new Error(`Item ${idx} pickup ${pIdx} name invalid`);
      if (p.address !== null && typeof p.address !== 'string') throw new Error(`Item ${idx} pickup ${pIdx} address invalid`);
      if (p.time_local !== null && !/^[0-2][0-9]:[0-5][0-9]$/.test(p.time_local)) {
        throw new Error(`Item ${idx} pickup ${pIdx} time_local invalid (${p.time_local})`);
      }
      if (p.timezone !== 'Asia/Ho_Chi_Minh') throw new Error(`Item ${idx} pickup ${pIdx} timezone invalid`);
    }

    // Check evidence
    if (!Array.isArray(item.evidence) || item.evidence.length === 0) throw new Error(`Item ${idx} evidence missing`);
    for (const ev of item.evidence) {
      if (!ev.field || !ev.source_url || !ev.section || !ev.observed_value) {
        throw new Error(`Item ${idx} invalid evidence entry`);
      }
    }

    // Check issues
    if (!Array.isArray(item.issues)) throw new Error(`Item ${idx} issues must be array`);
    for (const iss of item.issues) {
      if (!iss.field || !iss.reason) throw new Error(`Item ${idx} invalid issue entry`);
    }

    // Check review_status
    if (!['ready_for_review', 'needs_review'].includes(item.review_status)) {
      throw new Error(`Item ${idx} review_status invalid`);
    }
  }

  console.log("=== VALIDATING assets.json ===");
  const assetsRaw = fs.readFileSync('data/reference/gotrail/assets.json', 'utf8');
  const assets = JSON.parse(assetsRaw);
  if (assets.schema_version !== 1) throw new Error("assets.schema_version must be 1");
  if (!Array.isArray(assets.items)) throw new Error("assets.items must be an array");

  for (const [idx, item] of assets.items.entries()) {
    if (!seenUrls.has(item.source_url)) throw new Error(`Asset ${idx} has source_url not in catalog: ${item.source_url}`);
    if (!item.image_url || !item.image_url.startsWith('http')) throw new Error(`Asset ${idx} has invalid image_url`);
    if (!['cover', 'gallery', 'difficulty'].includes(item.role)) throw new Error(`Asset ${idx} has invalid role`);
    if (item.alt !== null && typeof item.alt !== 'string') throw new Error(`Asset ${idx} has invalid alt`);
    if (!item.fetched_at || !item.fetched_at.endsWith('Z')) throw new Error(`Asset ${idx} has invalid fetched_at`);
  }

  console.log(`\nALL CHECKS PASSED SUCCESSFULLY!`);
  console.log(`Catalog: ${catalog.items.length} routes validated.`);
  console.log(`Assets: ${assets.items.length} manifest images validated.`);
}

validate();
