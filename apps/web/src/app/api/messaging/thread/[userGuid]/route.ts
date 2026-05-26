import { getServices } from "@/lib/container";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ userGuid: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const { userGuid } = await params;
  const to = new URL(req.url).searchParams.get("to");
  try {
    const thread = getServices().messagingService.getThread(userGuid, to ?? "");
    return Response.json(thread);
  } catch (err) {
    return errorResponse(err, `api/messaging/thread/${userGuid}`);
  }
}
