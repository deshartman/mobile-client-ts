import { getServices } from "@/lib/container";
import { logOut } from "@/lib/logger";
import { EMPTY_TWIML, FORBIDDEN_TWIML, readTwilioForm, twimlResponse } from "@/lib/twilio-validate";
import type { OutgoingTwimlParams, DestinationType } from "@/lib/services/voice-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await readTwilioForm(req);
  if (!form) return twimlResponse(FORBIDDEN_TWIML, 403);

  const { voiceService, webhookService } = getServices();
  const params: OutgoingTwimlParams = {};
  for (const [k, v] of form.params) params[k] = v;

  const callSid = params.CallSid;
  const userGuid = params.userGuid;
  const to = params.To;
  const destinationType = (params.destinationType as DestinationType | undefined) ?? "phone";

  logOut(
    "api/voice/outgoing",
    `CallSid=${callSid ?? "n/a"} To=${to ?? "n/a"} userGuid=${userGuid ?? "n/a"} destinationType=${destinationType}`,
  );

  if (destinationType === "phone" && callSid && userGuid && to) {
    webhookService.registerOutboundCall({
      callSid,
      userGuid,
      to,
      contactGuid: params.contactGuid,
    });
  }

  try {
    return twimlResponse(voiceService.generateOutgoingTwiml(params));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logOut("api/voice/outgoing", `Build failed, returning empty TwiML: ${msg}`);
    return twimlResponse(EMPTY_TWIML);
  }
}
