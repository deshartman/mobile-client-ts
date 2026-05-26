import { getServices } from "@/lib/container";
import { logOut } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 20_000;
const encoder = new TextEncoder();

interface Params {
  params: Promise<{ userGuid: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const { userGuid } = await params;
  const { sseService } = getServices();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      sseService.register(userGuid, controller);
      controller.enqueue(encoder.encode("event: connected\ndata: {}\n\n"));

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_INTERVAL_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        sseService.unregister(userGuid, controller);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      if (req.signal.aborted) {
        cleanup();
      } else {
        req.signal.addEventListener("abort", cleanup, { once: true });
      }
    },
  });

  logOut(`api/events/${userGuid}`, "SSE client connected");

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
