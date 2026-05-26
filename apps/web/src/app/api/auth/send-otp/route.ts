import { SendOtpRequestSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { errorResponse, parseJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await parseJson(req, SendOtpRequestSchema);
  if (parsed instanceof Response) return parsed;
  try {
    const result = await getServices().authService.requestOtp(parsed.phone);
    return Response.json({ sent: true, ...result });
  } catch (err) {
    return errorResponse(err, "api/auth/send-otp");
  }
}
