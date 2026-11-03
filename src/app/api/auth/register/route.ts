import { getAuthSecret } from "@/server/auth/config";
import { getTrustedClientIp } from "@/server/auth/client-source";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { accountsService } from "@/server/services/accounts";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const secret = getAuthSecret();
    const input = await readJson(request);
    const source = getTrustedClientIp(request.headers);
    return json(await accountsService.registerRateLimitedCustomer(input, secret, source), 201);
  } catch (error) { return errorResponse(error); }
}
