import { VerifyOtpRequestSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { errorResponse, parseJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await parseJson(req, VerifyOtpRequestSchema);
  if (parsed instanceof Response) return parsed;
  try {
    const result = getServices().authService.verifyOtp(parsed.phone, parsed.code);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err, "api/auth/verify-otp");
  }
}
