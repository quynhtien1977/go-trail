import { assertCronSecret } from "@/server/auth/cron";
import { errorResponse, json } from "@/server/http";
import { cronService } from "@/server/services/cron";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    assertCronSecret(authorization);
    return json(await cronService.closeDepartures(authorization));
  } catch (error) { return errorResponse(error); }
}
