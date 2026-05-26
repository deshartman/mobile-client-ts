import { CompleteVideoRequestSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { errorResponse, parseJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await parseJson(req, CompleteVideoRequestSchema);
  if (parsed instanceof Response) return parsed;
  try {
    await getServices().videoService.completeVideoCall(parsed.inviteToken);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "api/video/complete");
  }
}
