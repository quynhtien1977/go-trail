import assert from "node:assert/strict";
import { test } from "node:test";
import { readImage, createMediaStorage } from "../scripts/catalog/media-storage.ts";

const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,1,2,3,4]);
test("image reads reject HTML masquerading as JPEG and oversized responses",async()=>{
  assert.equal((await readImage(new Response(jpeg,{headers:{'content-type':'image/jpeg'}}))).extension,'jpg');
  await assert.rejects(readImage(new Response('<html>error</html>',{headers:{'content-type':'image/jpeg'}})),/image/);
  await assert.rejects(readImage(new Response(jpeg,{headers:{'content-length':'13000000'}})),/large/);
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(13*1024*1024));controller.close();}});
  await assert.rejects(readImage(new Response(stream)),/large/);
});
test("Storage uses immutable content keys, verifies existing bytes, and keeps credentials off public requests",async()=>{
  const objects=new Map();let uploads=0;
  const base='https://abcdefghijklmnopqrst.supabase.co';const key='isolated-server-only-key-not-real';
  const transport=async(url,options={})=>{
    if(String(url).startsWith('https://gotrail.vn/')){
      assert.equal(options.headers?.apikey,undefined);return new Response(jpeg,{headers:{'content-type':'image/jpeg'}});
    }
    if(options.method==='POST'){
      assert.equal(options.headers.apikey,key);assert.equal(options.headers['x-upsert'],'false');
      uploads++;objects.set(String(url).replace('/object/','/object/public/'),options.body);
      return new Response('{}');
    }
    assert.equal(options.headers?.apikey,undefined);
    return objects.has(String(url))?new Response(objects.get(String(url)),{headers:{'content-type':'image/jpeg'}}):new Response('',{status:404});
  };
  const storage=createMediaStorage(base,key,transport);
  const first=await storage.ensure('https://gotrail.vn/wp-content/uploads/a.jpg');
  assert.match(first.storage_path,/^trips\/assets\/[a-f0-9]{64}\.jpg$/);
  assert.deepEqual(await storage.ensure('https://gotrail.vn/wp-content/uploads/b.jpg'),first);
  assert.equal(uploads,1);
  const corrupt=async(url)=>new Response(String(url).startsWith('https://gotrail.vn/')?jpeg:Buffer.from([0xff,0xd8,0xff,0xe0,9]));
  await assert.rejects(createMediaStorage(base,key,corrupt).ensure('https://gotrail.vn/wp-content/uploads/a.jpg'));
});

test("source redirects cannot cross origin or forward Storage credentials",async()=>{
  let calls=0;
  const redirect=async(_url,options)=>{calls++;assert.equal(options.headers?.apikey,undefined);return new Response('',{status:302,headers:{location:'https://evil.example/private.jpg'}});};
  await assert.rejects(createMediaStorage('https://abcdefghijklmnopqrst.supabase.co','isolated-server-key-at-least-32-characters',redirect)
    .ensure('https://gotrail.vn/wp-content/uploads/test.jpg'),/Untrusted/);
  assert.equal(calls,1);
});
