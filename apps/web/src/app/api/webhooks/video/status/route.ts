import { VideoStatusWebhookSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { logError, logOut } from "@/lib/logger";
import { EMPTY_TWIML, FORBIDDEN_TWIML, readTwilioForm, twimlResponse } from "@/lib/twilio-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await readTwilioForm(req);
  if (!form) return twimlResponse(FORBIDDEN_TWIML, 403);

  const parsed = VideoStatusWebhookSchema.safeParse(Object.fromEntries(form.params));
  if (!parsed.success) {
    logError("api/webhooks/video/status", `Schema mismatch: ${JSON.stringify(parsed.error.flatten())}`);
    return twimlResponse(EMPTY_TWIML);
  }

  logOut(
    "api/webhooks/video/status",
    `RoomSid=${parsed.data.RoomSid} Event=${parsed.data.StatusCallbackEvent ?? "n/a"} Status=${parsed.data.RoomStatus ?? "n/a"}`,
  );

  if (parsed.data.StatusCallbackEvent === "room-ended") {
    try {
      getServices().videoService.handleRoomEndedWebhook(parsed.data.RoomSid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError("api/webhooks/video/status", msg);
    }
  }
  return twimlResponse(EMPTY_TWIML);
}
