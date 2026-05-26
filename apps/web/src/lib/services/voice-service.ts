import twilio from "twilio";
import { env } from "../env";
import { AppError, NotFoundError, ValidationError } from "../errors";
import { logOut } from "../logger";
import type { UserService } from "./user-service";

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;
const VoiceResponse = twilio.twiml.VoiceResponse;

const RESERVED_PARAMS = new Set([
  "From",
  "To",
  "CallSid",
  "AccountSid",
  "ApiVersion",
  "Direction",
  "CallerName",
  "destinationType",
]);

export type DestinationType = "phone" | "assistant" | "flex" | "custom";

export interface GenerateTokenResult {
  token: string;
  identity: string;
}

export interface OutgoingTwimlParams {
  userGuid?: string;
  destinationType?: DestinationType;
  To?: string;
  From?: string;
  phoneNumber?: string;
  assistantSid?: string;
  greeting?: string;
  voiceId?: string;
  [key: string]: string | undefined;
}

function normaliseOrigin(url: string): string {
  const hasScheme = /^https?:\/\//.test(url);
  return (hasScheme ? url : `http://${url}`).replace(/\/$/, "");
}

export class VoiceService {
  constructor(private readonly userService: UserService) {}

  generateToken(
    userGuid: string,
    opts: { twimlAppSid?: string; region?: string } = {},
  ): GenerateTokenResult {
    if (!userGuid) throw new ValidationError("Missing required parameter: userGuid");

    const user = this.userService.getUser(userGuid);
    if (!user) throw new NotFoundError(`User not found: ${userGuid}`);

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: opts.twimlAppSid ?? env.TWIML_APP_SID,
      incomingAllow: true,
    });

    const edgeRegion = opts.region ?? env.TWILIO_REGION;
    const tokenOptions: ConstructorParameters<typeof AccessToken>[3] = {
      identity: userGuid,
      ttl: 3600,
      ...(edgeRegion ? { region: edgeRegion } : {}),
    };

    const token = new AccessToken(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_API_KEY,
      env.TWILIO_API_SECRET,
      tokenOptions,
    );
    token.addGrant(voiceGrant);

    logOut("VoiceService", `Token generated for ${userGuid} (region=${edgeRegion ?? "default"})`);
    return { token: token.toJwt(), identity: userGuid };
  }

  generateIncomingTwiml(clientIdentity: string | undefined): string {
    const twiml = new VoiceResponse();
    if (!clientIdentity) {
      twiml.say("We're sorry, but we're unable to connect your call at this time.");
      return twiml.toString();
    }
    this.appendTranscriptionIfEnabled(twiml);
    const dial = twiml.dial();
    dial.client(clientIdentity);
    return twiml.toString();
  }

  generateOutgoingTwiml(params: OutgoingTwimlParams = {}): string {
    const voiceResponse = new VoiceResponse();
    try {
      const destinationType: DestinationType = params.destinationType ?? "phone";
      logOut(
        "VoiceService",
        `Outgoing TwiML — destinationType=${destinationType}, From=${params.From ?? "n/a"}`,
      );

      switch (destinationType) {
        case "phone":
          this.buildPhoneTwiml(voiceResponse, params);
          break;
        case "assistant":
          this.buildAssistantTwiml(voiceResponse, params);
          break;
        case "flex":
          this.buildFlexTwiml(voiceResponse, params);
          break;
        case "custom":
          voiceResponse.say(
            "This is a custom routing configuration. Please configure your destination.",
          );
          break;
      }
      return voiceResponse.toString();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logOut("VoiceService", `Error building outgoing TwiML: ${msg}`);
      const errorResponse = new VoiceResponse();
      errorResponse.say(
        "We're sorry, but we're unable to connect your call at this time. Please try again later.",
      );
      return errorResponse.toString();
    }
  }

  private buildPhoneTwiml(voiceResponse: InstanceType<typeof VoiceResponse>, params: OutgoingTwimlParams): void {
    let phoneNumber = params.phoneNumber ?? params.To;
    if (phoneNumber?.startsWith(" ")) {
      phoneNumber = `+${phoneNumber.trim()}`;
    }
    if (!phoneNumber) throw new ValidationError("Missing phoneNumber/To for phone destination");
    if (!params.userGuid) throw new ValidationError("Missing userGuid — required to resolve caller ID");

    const user = this.userService.getUser(params.userGuid);
    if (!user?.twilioNumber) {
      throw new AppError(
        `User ${params.userGuid} has no twilio_number provisioned — cannot place outbound call`,
        400,
      );
    }
    const callerId = user.twilioNumber;

    const origin = normaliseOrigin(env.SERVER_BASE_URL);
    const statusCallback = `${origin}/api/webhooks/voice/status`;

    logOut(
      "VoiceService",
      `Dialing phone: ${phoneNumber} (callerId=${callerId}, statusCb=${statusCallback})`,
    );
    this.appendTranscriptionIfEnabled(voiceResponse);
    const dial = voiceResponse.dial({ callerId, action: statusCallback });
    dial.number(
      {
        statusCallback,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
      },
      phoneNumber,
    );
  }

  private buildAssistantTwiml(
    voiceResponse: InstanceType<typeof VoiceResponse>,
    params: OutgoingTwimlParams,
  ): void {
    const assistantSid = params.assistantSid ?? env.VOICE_SDK_ASSISTANT_SID;
    if (!assistantSid) {
      throw new ValidationError("Missing assistantSid — pass as param or set VOICE_SDK_ASSISTANT_SID");
    }
    const greeting = params.greeting ?? env.VOICE_SDK_GREETING ?? "Hello! How can I help you today?";
    const voiceId = params.voiceId ?? env.VOICE_SDK_VOICE_ID ?? "en-US-Journey-O";

    logOut("VoiceService", `Connecting to Assistant: ${assistantSid} (voice=${voiceId})`);
    const connect = voiceResponse.connect();
    connect.assistant({ id: assistantSid, welcomeGreeting: greeting, voice: voiceId });
  }

  private buildFlexTwiml(
    voiceResponse: InstanceType<typeof VoiceResponse>,
    params: OutgoingTwimlParams,
  ): void {
    const workflowSid = env.FLEX_WORKFLOW_SID;
    const workspaceSid = env.FLEX_WORKSPACE_SID;
    if (!workflowSid || !workspaceSid) {
      throw new ValidationError("Missing FLEX_WORKFLOW_SID or FLEX_WORKSPACE_SID");
    }

    const taskAttributes: Record<string, string> = {
      from: params.From ?? "",
      channel: "voice",
      source: "voice-sdk-web-client",
    };
    for (const [k, v] of Object.entries(params)) {
      if (!RESERVED_PARAMS.has(k) && typeof v === "string" && v.length > 0) {
        taskAttributes[k] = v;
      }
    }

    logOut("VoiceService", `Enqueuing to Flex workflow ${workflowSid}`);
    const enqueue = voiceResponse.enqueue({ workflowSid });
    enqueue.task(JSON.stringify(taskAttributes));
  }

  private appendTranscriptionIfEnabled(voiceResponse: InstanceType<typeof VoiceResponse>): void {
    const engine = env.TRANSCRIPTION_ENGINE;
    if (!engine) return;
    const origin = normaliseOrigin(env.SERVER_BASE_URL);
    const statusCallbackUrl = `${origin}/api/webhooks/voice/transcription`;
    const languageCode = env.TRANSCRIPTION_LANGUAGE_CODE ?? "en-US";

    const start = voiceResponse.start();
    start.transcription({
      statusCallbackUrl,
      track: "both_tracks",
      languageCode,
      transcriptionEngine: engine,
      partialResults: false,
    });
  }
}
