import { StartVideoRequestSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { errorResponse, parseJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await parseJson(req, StartVideoRequestSchema);
  if (parsed instanceof Response) return parsed;
  try {
    const result = await getServices().videoService.startVideoCall(parsed);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err, "api/video/start");
  }
}
