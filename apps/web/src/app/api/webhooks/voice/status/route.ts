import { VoiceStatusWebhookSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { logError, logOut } from "@/lib/logger";
import { EMPTY_TWIML, FORBIDDEN_TWIML, readTwilioForm, twimlResponse } from "@/lib/twilio-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await readTwilioForm(req);
  if (!form) return twimlResponse(FORBIDDEN_TWIML, 403);

  const parsed = VoiceStatusWebhookSchema.safeParse(Object.fromEntries(form.params));
  if (!parsed.success) {
    logError("api/webhooks/voice/status", `Schema mismatch: ${JSON.stringify(parsed.error.flatten())}`);
    return twimlResponse(EMPTY_TWIML);
  }

  logOut(
    "api/webhooks/voice/status",
    `CallSid=${parsed.data.CallSid} CallStatus=${parsed.data.CallStatus} DialCallStatus=${parsed.data.DialCallStatus ?? "n/a"}`,
  );

  try {
    getServices().webhookService.handleVoiceStatus(parsed.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("api/webhooks/voice/status", msg);
  }
  return twimlResponse(EMPTY_TWIML);
}
