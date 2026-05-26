import { getServices } from "@/lib/container";
import { NotFoundError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ userGuid: string; threadId: string }>;
}

export async function POST(_req: Request, { params }: Params) {
  const { userGuid, threadId } = await params;
  try {
    const { messagesRepo, sseService } = getServices();
    const thread = messagesRepo.findThreadById(threadId);
    if (thread?.userGuid !== userGuid) {
      throw new NotFoundError("Thread not found");
    }
    const readAt = new Date().toISOString();
    const markedCount = messagesRepo.markThreadRead(threadId, readAt);
    if (markedCount > 0) {
      sseService.broadcast({
        type: "thread.read",
        userGuid,
        payload: {
          threadId,
          remoteAddress: thread.remoteAddress,
          contactGuid: thread.contactGuid,
          readAt,
        },
      });
    }
    return Response.json({ markedCount });
  } catch (err) {
    return errorResponse(err, `api/messaging/thread/${userGuid}/${threadId}/read`);
  }
}
