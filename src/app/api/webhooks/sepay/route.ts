import { errorResponse, readBodyText } from "@/server/http";
import { paymentService } from "@/server/services/payments";

// SePay defines this contract, so the acknowledgement is its own body, not the project { data } envelope.
export async function POST(request: Request) {
  try {
    const raw = await readBodyText(request);
    const ack = await paymentService.recordSepayPayment(request.headers.get("authorization"), raw);
    return Response.json(ack, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
