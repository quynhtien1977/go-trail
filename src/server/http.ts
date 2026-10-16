import "server-only";
import { AppError } from "./errors";

export function json(data: unknown, status = 200): Response {
  return Response.json({ data }, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) return Response.json({ error: { code: error.code, message: error.message } }, {
    status: error.status, headers: { "Cache-Control": "private, no-store" },
  });
  console.error("API_REQUEST_FAILED");
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "Không thể xử lý yêu cầu lúc này." } }, {
    status: 500, headers: { "Cache-Control": "private, no-store" },
  });
}
export function assertSameOrigin(request: Request): void {
  const expected = new URL(process.env.NEXTAUTH_URL ?? request.url).origin;
  if (request.headers.get("origin") !== expected) throw new AppError("FORBIDDEN", 403);
}
export async function readBodyText(request: Request, maxBytes = 8192): Promise<string> {
  if (!request.body) throw new AppError("INVALID_INPUT", 422);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new AppError("INVALID_INPUT", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new AppError("INVALID_INPUT", 422); }
}
export async function readJson(request: Request, maxBytes?: number): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new AppError("INVALID_INPUT", 415);
  }
  const text = await readBodyText(request, maxBytes);
  try { return JSON.parse(text); } catch { throw new AppError("INVALID_INPUT", 422); }
}
export function parseId(value: string): number {
  if (!/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) throw new AppError("INVALID_INPUT", 422);
  return Number(value);
}
export function readQuery(request: Request): Record<string, string> {
  const params = new URL(request.url).searchParams;
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key)) throw new AppError("INVALID_INPUT", 422);
    seen.add(key);
  }
  return Object.fromEntries(params);
}
