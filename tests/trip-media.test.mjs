import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { readPublicTrip, listPublicTrips } from "../src/server/services/catalog.ts";
import { validateMediaSource, validateResolvedMedia, importMediaRows } from "../prisma/trip-media.ts";

const sourceUrl = "https://gotrail.vn/bus/trail-bus-ba-den/";
const imageUrl = "https://gotrail.vn/wp-content/uploads/2026/02/test.jpg";
const hash = "a".repeat(64);
const base = "https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/gotrail-media";
const placement = { placement: "Cover", sort_order: 0, source_url: imageUrl, alt_text: "Núi", caption: null, title: null, body: null };
const source = { schema_version: 1, trips: [{ trip_source_url: sourceUrl, media: [placement] }] };
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const resolved = () => ({ schema_version: 1, source_sha256: digest(source), storage_base_url: base,
  trips: [{ trip_source_url: sourceUrl, media: [{ ...placement, sha256: hash, storage_path: `trips/assets/${hash}.jpg` }] }] });

test("media manifests reject arbitrary origins, markup, stale review and mismatched placement mappings", () => {
  assert.equal(validateMediaSource(source).length, 1);
  assert.equal(validateResolvedMedia(source, resolved()).length, 1);
  for (const badUrl of ["http://127.0.0.1/private.jpg", "https://gotrail.vn.evil.test/a.jpg", "https://gotrail.vn/wp-admin/a.jpg"]) {
    const bad = structuredClone(source); bad.trips[0].media[0].source_url = badUrl;
    assert.throws(() => validateMediaSource(bad));
  }
  const stale = resolved(); stale.source_sha256 = "b".repeat(64);
  assert.throws(() => validateResolvedMedia(source, stale));
  const traversal = resolved(); traversal.trips[0].media[0].storage_path = "../another.jpg";
  assert.throws(() => validateResolvedMedia(source, traversal));
  const wrong = resolved(); wrong.trips[0].media[0].source_url = imageUrl.replace("test", "other");
  assert.throws(() => validateResolvedMedia(source, wrong));
  const markup = structuredClone(source); markup.trips[0].media[0].caption = "<script>bad</script>";
  assert.throws(() => validateMediaSource(markup));
});

test("media import is idempotent, matches stable trip identities, preserves edits and rolls back conflicts", async () => {
  const database = await createTestDatabase();
  const db = database.client;
  try {
    const trip = await db.trip.create({ data: { name: "Original", city: "City", location_name: "Place", length_km: "0", base_price: "0",
      description: "Description", schedule_content: "Schedule", source_url: sourceUrl } });
    const entries = validateResolvedMedia(source, resolved());
    const run = () => db.$transaction(async tx => importMediaRows((sql, values=[]) => tx.$queryRawUnsafe(sql, ...values), entries));
    assert.deepEqual(await run(), { inserted: 1, existing: 0 });
    const before = await db.tripMedia.findMany();
    assert.deepEqual(await run(), { inserted: 0, existing: 1 });
    assert.deepEqual(await db.tripMedia.findMany(), before);
    assert.equal((await db.trip.findUnique({where:{trip_id:trip.trip_id}})).base_price.toFixed(0), "0");
    const dto = await readPublicTrip(db, trip.trip_id);
    assert.equal(dto.media.length, 1);
    assert.equal(dto.cover_image_url, `${base}/trips/assets/${hash}.jpg`);
    assert.equal(dto.media[0].url, dto.cover_image_url);
    assert.equal("source_url" in dto.media[0], false);
    assert.equal((await listPublicTrips(db)).items[0].cover_image_url, dto.cover_image_url);
    await db.tripMedia.update({where:{media_id:before[0].media_id}, data:{caption:"Edited by manager"}});
    const conflictBatch=structuredClone(entries);
    conflictBatch[0].media.unshift({...entries[0].media[0],placement:"Hero"});
    await assert.rejects(db.$transaction(async tx=>importMediaRows((sql,values=[])=>tx.$queryRawUnsafe(sql,...values),conflictBatch)), /reconciliation/);
    assert.equal(await db.tripMedia.count(),1); // Hero inserted earlier in the same transaction rolled back.
    await assert.rejects(run(), /reconciliation/);
    assert.equal((await db.tripMedia.findFirst()).caption, "Edited by manager");
    await db.tripMedia.updateMany({data:{is_active:false}});
    assert.deepEqual((await readPublicTrip(db,trip.trip_id)).media, []);
    assert.equal((await listPublicTrips(db)).items[0].cover_image_url, null);
    await db.trip.update({where:{trip_id:trip.trip_id},data:{is_active:false}});
    await assert.rejects(readPublicTrip(db,trip.trip_id), {code:"NOT_FOUND"});
    assert.equal(await db.tripMedia.count(), 1);
  } finally { await database.close(); }
});

test("media constraints enforce cover uniqueness, parent ownership, placement shape and Data API isolation", async () => {
  const database = await createTestDatabase();
  try {
    const {sql}=database;
    await sql.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role");
    const [{relrowsecurity}] = (await sql.query("SELECT relrowsecurity FROM pg_class WHERE oid='trip_media'::regclass")).rows;
    assert.equal(relrowsecurity,true);
    for(const role of ["anon","authenticated","service_role"]){
      assert.equal((await sql.query("SELECT has_table_privilege($1,'trip_media','SELECT') AS allowed",[role])).rows[0].allowed,false);
      assert.equal((await sql.query("SELECT has_sequence_privilege($1,'trip_media_media_id_seq','USAGE') AS allowed",[role])).rows[0].allowed,false);
    }
    const parent=await database.client.trip.create({data:{name:"Media parent",city:"City",location_name:"Place",length_km:"1",base_price:"0",description:"Fixture",schedule_content:"Fixture"}});
    const row={trip_id:parent.trip_id,placement:"Cover",sort_order:0,source_url:imageUrl,storage_url:`${base}/trips/assets/${hash}.jpg`,content_sha256:hash,alt_text:"Núi"};
    await database.client.tripMedia.create({data:row});
    await assert.rejects(database.client.tripMedia.create({data:row}));
    await assert.rejects(database.client.tripMedia.create({data:{...row,sort_order:1}}));
    await assert.rejects(database.client.tripMedia.create({data:{...row,placement:"Highlight"}}));
    await assert.rejects(database.client.tripMedia.create({data:{...row,placement:"Hero",content_sha256:"bad"}}));
    await assert.rejects(database.client.trip.delete({where:{trip_id:parent.trip_id}}));
    await assert.rejects(sql.exec(`INSERT INTO trip_media(trip_id,placement,sort_order,source_url,storage_url,content_sha256,alt_text)
      VALUES(999,'Cover',0,'${imageUrl}','${base}/trips/assets/${hash}.jpg','${hash}','Núi')`),{code:"23503"});
  }finally{await database.close();}
});
