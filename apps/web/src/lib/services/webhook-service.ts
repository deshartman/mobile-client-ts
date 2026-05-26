import type {
  InboundSmsWebhook,
  MessageStatus,
  TranscriptionTrack,
  VoiceStatusWebhook,
} from "@mobileclient/shared-types";
import { logError, logOut } from "../logger";
import type { ContactService } from "./contact-service";
import type { MessagesRepository } from "./messages-repository";
import type { MessagingService } from "./messaging-service";
import type { SseService } from "./sse-service";
import type { TranscriptionsRepository } from "./transcriptions-repository";
import type { UserService } from "./user-service";

interface CallMapping {
  userGuid: string;
  to: string;
  contactGuid: string | null;
  direction: "inbound" | "outbound";
  startedAt: number;
}

export interface RegisterOutboundCallInput {
  callSid: string;
  userGuid: string;
  to: string;
  contactGuid?: string | null;
}

export interface RegisterIncomingCallInput {
  callSid: string;
  userGuid: string;
  from: string;
  to: string;
}

export interface HandleTranscriptionInput {
  callSid: string;
  sequenceId: number;
  track: TranscriptionTrack;
  transcriptionData: string;
  transcriptionEvent?: string;
  final?: string;
  timestamp?: string;
}

export interface HandleMessageStatusInput {
  messageSid: string;
  messageStatus: MessageStatus;
}

export class WebhookService {
  private readonly callMap = new Map<string, CallMapping>();

  constructor(
    private readonly contactService: ContactService,
    private readonly userService: UserService,
    private readonly sseService: SseService,
    private readonly messagesRepo: MessagesRepository,
    private readonly messagingService: MessagingService,
    private readonly transcriptionsRepo: TranscriptionsRepository,
  ) {}

  registerOutboundCall(input: RegisterOutboundCallInput): void {
    this.callMap.set(input.callSid, {
      userGuid: input.userGuid,
      to: input.to,
      contactGuid: input.contactGuid ?? null,
      direction: "outbound",
      startedAt: Date.now(),
    });
    logOut(
      "WebhookService",
      `Registered outbound call ${input.callSid} for user ${input.userGuid} → ${input.to}`,
    );
  }

  registerIncomingCall(input: RegisterIncomingCallInput): void {
    this.callMap.set(input.callSid, {
      userGuid: input.userGuid,
      to: input.from,
      contactGuid: null,
      direction: "inbound",
      startedAt: Date.now(),
    });
    logOut(
      "WebhookService",
      `Registered inbound call ${input.callSid} for user ${input.userGuid} (from ${input.from} → ${input.to})`,
    );
    this.sseService.broadcast({
      type: "incoming-call",
      userGuid: input.userGuid,
      payload: { callSid: input.callSid, from: input.from },
    });
  }

  handleVoiceStatus(payload: VoiceStatusWebhook): void {
    const mapping = this.callMap.get(payload.CallSid);
    if (!mapping) {
      logOut(
        "WebhookService",
        `Voice webhook for unregistered CallSid: ${payload.CallSid} (CallStatus=${payload.CallStatus}, DialCallStatus=${payload.DialCallStatus ?? "n/a"})`,
      );
      return;
    }

    logOut(
      "WebhookService",
      `Voice status for ${payload.CallSid}: CallStatus=${payload.CallStatus}, DialCallStatus=${payload.DialCallStatus ?? "n/a"}`,
    );

    const dialFinished = payload.DialCallStatus === "completed";
    const parentFinished = payload.CallStatus === "completed";
    if (!dialFinished && !parentFinished) return;

    const rawSeconds =
      payload.Duration ??
      Math.round((Date.now() - mapping.startedAt) / 1000);
    const durationMinutes = Math.max(1, Math.round(rawSeconds / 60));

    this.contactService.addActivity(mapping.userGuid, {
      type: "Phone",
      datetime: new Date().toISOString(),
      duration: durationMinutes,
      identityValue: mapping.to,
      contactGuid: mapping.contactGuid,
      callSid: payload.CallSid,
    });
    this.callMap.delete(payload.CallSid);
  }

  handleTranscription(input: HandleTranscriptionInput): void {
    if (input.transcriptionEvent && input.transcriptionEvent !== "transcription-content") {
      logOut(
        "WebhookService",
        `Transcription event ${input.transcriptionEvent} for ${input.callSid} — ignored`,
      );
      return;
    }
    if (input.final !== "true") return;

    let parsed: { transcript?: string; confidence?: number };
    try {
      parsed = JSON.parse(input.transcriptionData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError(
        "WebhookService",
        `handleTranscription: TranscriptionData not JSON (${msg}): ${input.transcriptionData}`,
      );
      return;
    }
    const transcript = parsed.transcript;
    if (!transcript) return;

    const inserted = this.transcriptionsRepo.insertIfAbsent({
      correlationSid: input.callSid,
      sequenceId: input.sequenceId,
      track: input.track,
      transcript,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
      datetime: input.timestamp ?? new Date().toISOString(),
      source: "voice",
    });
    if (inserted) {
      logOut(
        "WebhookService",
        `Transcription ${input.callSid}#${input.sequenceId} (${input.track}): ${transcript}`,
      );
    } else {
      logOut(
        "WebhookService",
        `Transcription ${input.callSid}#${input.sequenceId} — duplicate ignored`,
      );
    }
  }

  handleMessageStatus(input: HandleMessageStatusInput): void {
    const updated = this.messagesRepo.updateMessageStatus(input.messageSid, input.messageStatus);
    if (!updated) {
      logOut(
        "WebhookService",
        `Status callback for unknown ${input.messageSid} (${input.messageStatus}) — ignored`,
      );
      return;
    }
    logOut("WebhookService", `Status ${input.messageSid} → ${input.messageStatus}`);
    this.sseService.broadcast({
      type: "message.status",
      userGuid: updated.userGuid,
      payload: {
        messageSid: updated.messageSid,
        threadId: updated.threadId,
        status: updated.status,
      },
    });
  }

  handleInboundSms(payload: InboundSmsWebhook): void {
    const owner = this.userService.getUserByTwilioNumber(payload.To);
    if (!owner) {
      logError("WebhookService", `Inbound SMS ${payload.MessageSid} for unowned number ${payload.To}`);
      return;
    }
    const userGuid = owner.userGuid;

    const thread = this.messagingService.ensureThread({
      userGuid,
      remoteAddress: payload.From,
    });

    const datetime = new Date().toISOString();
    const inserted = this.messagesRepo.insertMessageIfAbsent({
      messageSid: payload.MessageSid,
      threadId: thread.threadId,
      direction: "inbound",
      author: payload.From,
      body: payload.Body,
      datetime,
      index: null,
    });

    if (!inserted) {
      logOut("WebhookService", `Duplicate inbound ${payload.MessageSid} ignored`);
      return;
    }

    if (!thread.activityId) {
      const activity = this.contactService.addActivity(userGuid, {
        type: "Message",
        datetime,
        duration: 0,
        identityValue: thread.remoteAddress,
        contactGuid: thread.contactGuid ?? null,
      });
      this.messagesRepo.setThreadActivity(thread.threadId, activity.id);
    }

    this.sseService.broadcast({
      type: "message.added",
      userGuid,
      payload: {
        messageSid: payload.MessageSid,
        threadId: thread.threadId,
        direction: "inbound",
        author: payload.From,
        body: payload.Body,
        datetime,
      },
    });
  }
}
