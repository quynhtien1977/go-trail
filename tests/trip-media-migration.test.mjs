import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

test("TripMedia upgrade preserves existing trip data and revokes Supabase default table and sequence grants",async()=>{
  const db=await PGlite.create();
  try{
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;`);
    const root=new URL('../prisma/migrations/',import.meta.url),current='20261015000000_trip_media';
    for(const name of (await readdir(root)).filter(n=>/^\d+_/.test(n)&&n<current).sort())await db.exec(await readFile(new URL(`${name}/migration.sql`,root),'utf8'));
    await db.exec("INSERT INTO trips(name,city,location_name,length_km,base_price,description,schedule_content) VALUES('Existing','City','Place',1,0,'Original','Original')");
    const before=(await db.query('SELECT * FROM trips')).rows;
    await db.exec(await readFile(new URL(`${current}/migration.sql`,root),'utf8'));
    assert.deepEqual((await db.query('SELECT * FROM trips')).rows,before);
    for(const role of ['anon','authenticated','service_role']){
      const [row]=(await db.query("SELECT has_table_privilege($1,'trip_media','SELECT') AS read,has_table_privilege($1,'trip_media','INSERT') AS write,has_sequence_privilege($1,'trip_media_media_id_seq','USAGE') AS sequence",[role])).rows;
      assert.deepEqual(row,{read:false,write:false,sequence:false});
    }
  }finally{await db.close();}
});
