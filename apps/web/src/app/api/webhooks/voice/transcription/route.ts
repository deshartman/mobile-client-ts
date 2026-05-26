import { TranscriptionWebhookSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { logError, logOut } from "@/lib/logger";
import { FORBIDDEN_TWIML, readTwilioForm, twimlResponse } from "@/lib/twilio-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await readTwilioForm(req);
  if (!form) return twimlResponse(FORBIDDEN_TWIML, 403);

  const extended = { ...Object.fromEntries(form.params), TranscriptionEvent: form.params.get("TranscriptionEvent") ?? undefined };
  const parsed = TranscriptionWebhookSchema.safeParse(extended);
  if (!parsed.success) {
    logError(
      "api/webhooks/voice/transcription",
      `Schema mismatch: ${JSON.stringify(parsed.error.flatten())}`,
    );
    return new Response(null, { status: 204 });
  }

  const transcriptionEvent = form.params.get("TranscriptionEvent") ?? undefined;
  logOut(
    "api/webhooks/voice/transcription",
    `${parsed.data.CallSid} ${transcriptionEvent ?? "content"}#${parsed.data.SequenceId}`,
  );

  try {
    getServices().webhookService.handleTranscription({
      callSid: parsed.data.CallSid,
      sequenceId: parsed.data.SequenceId,
      track: parsed.data.Track,
      transcriptionData: parsed.data.TranscriptionData,
      transcriptionEvent,
      final: parsed.data.Final,
      timestamp: form.params.get("Timestamp") ?? undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("api/webhooks/voice/transcription", msg);
  }
  return new Response(null, { status: 204 });
}
