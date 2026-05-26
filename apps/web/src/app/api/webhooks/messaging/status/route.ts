import { z } from "zod";
import { MessageStatusSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { logError, logOut } from "@/lib/logger";
import { FORBIDDEN_TWIML, readTwilioForm, twimlResponse } from "@/lib/twilio-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const StatusSchema = z.object({
  MessageSid: z.string().regex(/^SM[a-f0-9]{32}$/i),
  MessageStatus: MessageStatusSchema,
});

export async function POST(req: Request) {
  const form = await readTwilioForm(req);
  if (!form) return twimlResponse(FORBIDDEN_TWIML, 403);

  const parsed = StatusSchema.safeParse(Object.fromEntries(form.params));
  if (!parsed.success) {
    logError(
      "api/webhooks/messaging/status",
      `Schema mismatch: ${JSON.stringify(parsed.error.flatten())}`,
    );
    return new Response(null, { status: 204 });
  }

  logOut(
    "api/webhooks/messaging/status",
    `${parsed.data.MessageSid} → ${parsed.data.MessageStatus}`,
  );

  try {
    getServices().webhookService.handleMessageStatus({
      messageSid: parsed.data.MessageSid,
      messageStatus: parsed.data.MessageStatus,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("api/webhooks/messaging/status", msg);
  }
  return new Response(null, { status: 204 });
}
