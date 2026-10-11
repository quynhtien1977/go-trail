import { registrationSchema } from "@/schemas/auth";
import { getAuthSecret } from "@/server/auth/config";
import { getTrustedClientIp } from "@/server/auth/client-source";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { getDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { registerCustomer } from "@/server/services/accounts";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const secret = getAuthSecret();
    const db = getDb();
    const input = registrationSchema.safeParse(await readJson(request));
    if (!input.success) throw new AppError("INVALID_INPUT", 422);
    const source = getTrustedClientIp(request.headers);
    if (source) {
      const sourceLimit = await consumeRateLimit("registration-source", source, secret, 50);
      if (!sourceLimit.allowed) throw new AppError("RATE_LIMITED", 429);
    }
    const emailLimit = await consumeRateLimit("registration-email", input.data.email, secret, 3);
    if (!emailLimit.allowed) throw new AppError("RATE_LIMITED", 429);
    return json(await registerCustomer(db, input.data), 201);
  } catch (error) { return errorResponse(error); }
}
