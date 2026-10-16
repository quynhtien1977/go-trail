import { createHash } from "node:crypto";

// One verified source PNG is 9.2 MB. Keep an explicit 12 MiB safety ceiling;
// standard Storage uploads support this size, though >6 MB may benefit from TUS.
const MAX_BYTES = 12 * 1024 * 1024;
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
export async function readImage(response: Response) {
  check(response.ok && response.body, "Media image request failed.");
  check(Number(response.headers.get("content-length") ?? 0) <= MAX_BYTES, "Media image too large.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Media image too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = Buffer.concat(chunks);
  const extension = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff ? "jpg"
    : data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png"
    : data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP" ? "webp" : null;
  check(extension, "Unsupported or invalid media image bytes.");
  const mime = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[extension];
  const declared = response.headers.get("content-type")?.split(";")[0];
  check(!declared || declared === mime || declared === "application/octet-stream", "Media image MIME mismatch.");
  return { data, extension, mime, sha256: createHash("sha256").update(data).digest("hex") };
}
function sourceUrl(value: string) {
  const url = new URL(value);
  check(url.origin === "https://gotrail.vn" && url.pathname.startsWith("/wp-content/uploads/")
    && !url.username && !url.password && !url.search && !url.hash, "Untrusted media source.");
  return url.href;
}
export function createMediaStorage(projectUrl: string, key: string, transport: typeof fetch = fetch) {
  check(/^https:\/\/[a-z]{20}\.supabase\.co$/.test(projectUrl) && key.length >= 32, "Missing or invalid server Storage configuration.");
  const base = `${projectUrl}/storage/v1/object/public/gotrail-media`;
  const auth: Record<string, string> = { apikey: key };
  if (key.startsWith("eyJ")) auth.Authorization = `Bearer ${key}`;
  const sources = new Map<string, Promise<{ sha256: string; storage_path: string }>>();
  const verified = new Set<string>();
  async function get(url: string, original = false) {
    let current = original ? sourceUrl(url) : url;
    for (let hop = 0; hop < 4; hop++) {
      const response = await transport(current, { redirect: "manual", signal: AbortSignal.timeout(30000) });
      if (response.status < 300 || response.status >= 400) return response;
      const next = response.headers.get("location");
      await response.body?.cancel();
      check(original && next && hop < 3, "Unexpected media redirect.");
      current = sourceUrl(new URL(next, current).href);
    }
    throw new Error("Too many media redirects.");
  }
  async function verify(url: string, expected: string) {
    const response = await get(url);
    if (response.status === 404 || response.status === 400) {
      // Supabase public objects return 400 with an Object not found error on some versions.
      if (response.status === 400) {
        const body = await response.json().catch(() => null);
        check(body?.statusCode === "404" || body?.error === "not_found" || body?.message === "Object not found", "Storage public read failed.");
      } else await response.body?.cancel();
      return false;
    }
    check((await readImage(response)).sha256 === expected, "Existing media object differs; no overwrite performed.");
    return true;
  }
  async function resolve(url: string) {
    const image = await readImage(await get(url, true));
    const storage_path = `trips/assets/${image.sha256}.${image.extension}`;
    if (!verified.has(storage_path)) {
      const publicUrl = `${base}/${storage_path}`;
      if (!await verify(publicUrl, image.sha256)) {
        const uploaded = await transport(`${projectUrl}/storage/v1/object/gotrail-media/${storage_path}`, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
          headers: { ...auth, "Content-Type": image.mime, "x-upsert": "false", "cache-control": "max-age=31536000" },
          body: image.data,
        });
        // A concurrent importer may have won the immutable object key.
        check(uploaded.ok || uploaded.status === 400 || uploaded.status === 409, "Storage upload failed; details suppressed.");
        await uploaded.body?.cancel();
        check(await verify(publicUrl, image.sha256), "Uploaded media could not be verified.");
      }
      verified.add(storage_path);
    }
    return { sha256: image.sha256, storage_path };
  }
  return { base, ensure(url: string) {
    sourceUrl(url);
    if (!sources.has(url)) sources.set(url, resolve(url));
    return sources.get(url)!;
  } };
}
