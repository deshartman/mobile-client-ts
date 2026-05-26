import { getServices } from "@/lib/container";
import { logError, logOut } from "@/lib/logger";
import { FORBIDDEN_TWIML, readTwilioForm, twimlResponse } from "@/lib/twilio-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await readTwilioForm(req);
  if (!form) return twimlResponse(FORBIDDEN_TWIML, 403);

  const callSid = form.params.get("CallSid") ?? undefined;
  const from = form.params.get("From") ?? undefined;
  const to = form.params.get("To") ?? undefined;

  logOut("api/voice/incoming", `CallSid=${callSid ?? "n/a"} From=${from ?? "n/a"} To=${to ?? "n/a"}`);

  if (!to) {
    logError("api/voice/incoming", "Missing To field");
    return twimlResponse(getServices().voiceService.generateIncomingTwiml(undefined));
  }

  const { userService, voiceService, webhookService } = getServices();
  const owner = userService.getUserByTwilioNumber(to);
  if (!owner) {
    logError("api/voice/incoming", `No user owns number ${to}`);
    return twimlResponse(voiceService.generateIncomingTwiml(undefined));
  }

  if (callSid && from) {
    webhookService.registerIncomingCall({
      callSid,
      userGuid: owner.userGuid,
      from,
      to,
    });
  }

  return twimlResponse(voiceService.generateIncomingTwiml(owner.userGuid));
}
