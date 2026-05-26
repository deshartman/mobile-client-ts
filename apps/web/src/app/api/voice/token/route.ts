import { VoiceTokenRequestSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { errorResponse, parseJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await parseJson(req, VoiceTokenRequestSchema);
  if (parsed instanceof Response) return parsed;
  try {
    const result = getServices().voiceService.generateToken(parsed.userGuid);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err, "api/voice/token");
  }
}
