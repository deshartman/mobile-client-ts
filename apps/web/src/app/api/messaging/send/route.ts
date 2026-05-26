import { SendMessageRequestSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { errorResponse, parseJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await parseJson(req, SendMessageRequestSchema);
  if (parsed instanceof Response) return parsed;
  try {
    const result = await getServices().messagingService.sendMessage({
      userGuid: parsed.userGuid,
      remoteAddress: parsed.to,
      body: parsed.body,
    });
    return Response.json(result);
  } catch (err) {
    return errorResponse(err, "api/messaging/send");
  }
}
