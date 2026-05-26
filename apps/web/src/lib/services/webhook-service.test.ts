import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "@mobileclient/db";
import type {
  InboundSmsWebhook,
  SseEvent,
  VoiceStatusWebhook,
} from "@mobileclient/shared-types";
import { ContactService } from "./contact-service";
import { MessagesRepository } from "./messages-repository";
import { MessagingService } from "./messaging-service";
import { SseService } from "./sse-service";
import { TranscriptionsRepository } from "./transcriptions-repository";
import { UserService } from "./user-service";
import { WebhookService } from "./webhook-service";

const messagesCreateMock = vi.fn();
vi.mock("@/lib/twilio-client", () => ({
  getTwilioClient: () => ({ messages: { create: messagesCreateMock } }),
}));

const VALID_CA = "CA00000000000000000000000000000001";
const VALID_CA_2 = "CA00000000000000000000000000000002";
const VALID_SM = "SM11111111111111111111111111111111";
const VALID_SM_2 = "SM22222222222222222222222222222222";

let db: Database.Database;
let users: UserService;
let contacts: ContactService;
let messagesRepo: MessagesRepository;
let messagingService: MessagingService;
let transcriptionsRepo: TranscriptionsRepository;
let sse: SseService;
let svc: WebhookService;
let userGuid: string;
let broadcasts: SseEvent[];

beforeEach(() => {
  db = createTestDb();
  users = new UserService(db);
  messagesRepo = new MessagesRepository(db);
  transcriptionsRepo = new TranscriptionsRepository(db);
  sse = new SseService();
  broadcasts = [];
  sse.broadcast = vi.fn((event: SseEvent) => {
    broadcasts.push(event);
  });
  contacts = new ContactService(db, messagesRepo, sse);
  messagingService = new MessagingService(contacts, users, messagesRepo, sse);
  svc = new WebhookService(
    contacts,
    users,
    sse,
    messagesRepo,
    messagingService,
    transcriptionsRepo,
  );
  userGuid = users.createUser({ name: "John", twilioNumber: "+15559990000" });
});

describe("WebhookService.registerOutboundCall", () => {
  it("stores the mapping so handleVoiceStatus can find it", () => {
    svc.registerOutboundCall({ callSid: VALID_CA, userGuid, to: "+15554443333" });
    svc.handleVoiceStatus({
      CallSid: VALID_CA,
      CallStatus: "completed",
      From: "+15559990000",
      To: "+15554443333",
      Duration: 90,
    } as VoiceStatusWebhook);
    // activity got created because mapping was found
    const acts = contacts.getActivities(userGuid);
    expect(acts).toHaveLength(1);
    expect(acts[0]?.type).toBe("Phone");
  });
});

describe("WebhookService.registerIncomingCall", () => {
  it("broadcasts incoming-call SSE event", () => {
    svc.registerIncomingCall({
      callSid: VALID_CA,
      userGuid,
      from: "+15554443333",
      to: "+15559990000",
    });
    const incoming = broadcasts.find((b) => b.type === "incoming-call");
    expect(incoming).toBeDefined();
    expect((incoming as Extract<SseEvent, { type: "incoming-call" }>).payload.callSid).toBe(
      VALID_CA,
    );
  });
});

describe("WebhookService.handleVoiceStatus", () => {
  it("ignores unregistered CallSids (child legs)", () => {
    svc.handleVoiceStatus({
      CallSid: VALID_CA,
      CallStatus: "completed",
      From: "+1",
      To: "+2",
    } as VoiceStatusWebhook);
    expect(contacts.getActivities(userGuid)).toHaveLength(0);
  });

  it("ignores statuses that aren't terminal", () => {
    svc.registerOutboundCall({ callSid: VALID_CA, userGuid, to: "+15554443333" });
    svc.handleVoiceStatus({
      CallSid: VALID_CA,
      CallStatus: "in-progress",
      From: "+15559990000",
      To: "+15554443333",
    } as VoiceStatusWebhook);
    expect(contacts.getActivities(userGuid)).toHaveLength(0);
  });

  it("creates activity on DialCallStatus=completed on parent leg", () => {
    svc.registerOutboundCall({ callSid: VALID_CA, userGuid, to: "+15554443333" });
    svc.handleVoiceStatus({
      CallSid: VALID_CA,
      CallStatus: "in-progress",
      DialCallStatus: "completed",
      From: "+15559990000",
      To: "+15554443333",
      Duration: 65,
    } as VoiceStatusWebhook);
    expect(contacts.getActivities(userGuid)).toHaveLength(1);
  });

  it("rounds seconds up to minutes (minimum 1 minute)", () => {
    svc.registerOutboundCall({ callSid: VALID_CA, userGuid, to: "+15554443333" });
    svc.handleVoiceStatus({
      CallSid: VALID_CA,
      CallStatus: "completed",
      From: "+15559990000",
      To: "+15554443333",
      Duration: 5,
    } as VoiceStatusWebhook);
    const acts = contacts.getActivities(userGuid);
    expect(acts[0]?.duration).toBe(1);
  });

  it("stamps call_sid on the activity for transcript joins", () => {
    svc.registerOutboundCall({ callSid: VALID_CA, userGuid, to: "+15554443333" });
    svc.handleVoiceStatus({
      CallSid: VALID_CA,
      CallStatus: "completed",
      From: "+15559990000",
      To: "+15554443333",
      Duration: 60,
    } as VoiceStatusWebhook);
    const acts = contacts.getActivities(userGuid);
    expect(acts[0]?.callSid).toBe(VALID_CA);
  });

  it("deletes the mapping after processing — no double activity", () => {
    svc.registerOutboundCall({ callSid: VALID_CA, userGuid, to: "+15554443333" });
    svc.handleVoiceStatus({
      CallSid: VALID_CA,
      CallStatus: "completed",
      From: "+15559990000",
      To: "+15554443333",
      Duration: 60,
    } as VoiceStatusWebhook);
    svc.handleVoiceStatus({
      CallSid: VALID_CA,
      CallStatus: "completed",
      From: "+15559990000",
      To: "+15554443333",
      Duration: 60,
    } as VoiceStatusWebhook);
    expect(contacts.getActivities(userGuid)).toHaveLength(1);
  });
});

describe("WebhookService.handleTranscription", () => {
  it("ignores non-content transcriptionEvent", () => {
    svc.handleTranscription({
      callSid: VALID_CA,
      sequenceId: 0,
      track: "inbound_track",
      transcriptionData: "{}",
      transcriptionEvent: "transcription-started",
    });
    expect(transcriptionsRepo.getByCorrelationSid(VALID_CA)).toHaveLength(0);
  });

  it("skips non-Final utterances", () => {
    svc.handleTranscription({
      callSid: VALID_CA,
      sequenceId: 0,
      track: "inbound_track",
      transcriptionData: '{"transcript":"partial"}',
      final: "false",
    });
    expect(transcriptionsRepo.getByCorrelationSid(VALID_CA)).toHaveLength(0);
  });

  it("skips malformed JSON", () => {
    svc.handleTranscription({
      callSid: VALID_CA,
      sequenceId: 0,
      track: "inbound_track",
      transcriptionData: "not-json",
      final: "true",
    });
    expect(transcriptionsRepo.getByCorrelationSid(VALID_CA)).toHaveLength(0);
  });

  it("persists final utterance with transcript + confidence", () => {
    svc.handleTranscription({
      callSid: VALID_CA,
      sequenceId: 0,
      track: "inbound_track",
      transcriptionData: '{"transcript":"hello world","confidence":0.95}',
      final: "true",
    });
    const rows = transcriptionsRepo.getByCorrelationSid(VALID_CA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      transcript: "hello world",
      confidence: 0.95,
      track: "inbound_track",
    });
  });

  it("is idempotent on retry (same call_sid + sequence_id)", () => {
    const args = {
      callSid: VALID_CA,
      sequenceId: 0,
      track: "inbound_track" as const,
      transcriptionData: '{"transcript":"a"}',
      final: "true",
    };
    svc.handleTranscription(args);
    svc.handleTranscription(args);
    expect(transcriptionsRepo.getByCorrelationSid(VALID_CA)).toHaveLength(1);
  });

  it("skips when transcript is empty string", () => {
    svc.handleTranscription({
      callSid: VALID_CA_2,
      sequenceId: 0,
      track: "inbound_track",
      transcriptionData: '{"transcript":""}',
      final: "true",
    });
    expect(transcriptionsRepo.getByCorrelationSid(VALID_CA_2)).toHaveLength(0);
  });
});

describe("WebhookService.handleMessageStatus", () => {
  it("updates status and broadcasts message.status", async () => {
    // Seed an outbound message via the real pipeline
    messagesCreateMock.mockResolvedValueOnce({ sid: VALID_SM, status: "queued" });
    await messagingService.sendMessage({
      userGuid,
      remoteAddress: "+15554443333",
      body: "hi",
    });
    broadcasts.length = 0;

    svc.handleMessageStatus({ messageSid: VALID_SM, messageStatus: "delivered" });

    const statusEvents = broadcasts.filter((b) => b.type === "message.status");
    expect(statusEvents).toHaveLength(1);
    expect((statusEvents[0] as Extract<SseEvent, { type: "message.status" }>).payload).toMatchObject(
      {
        messageSid: VALID_SM,
        status: "delivered",
      },
    );
  });

  it("silently ignores unknown messageSid", () => {
    svc.handleMessageStatus({ messageSid: VALID_SM_2, messageStatus: "failed" });
    expect(broadcasts).toHaveLength(0);
  });
});

describe("WebhookService.handleInboundSms", () => {
  it("404s silently when To matches no user's provisioned number", () => {
    svc.handleInboundSms({
      From: "+15554443333",
      To: "+15550000000",
      Body: "hey",
      MessageSid: VALID_SM,
      NumMedia: 0,
    } as InboundSmsWebhook);
    expect(broadcasts).toHaveLength(0);
  });

  it("creates a thread, inserts message, broadcasts message.added", () => {
    svc.handleInboundSms({
      From: "+15554443333",
      To: "+15559990000",
      Body: "hey",
      MessageSid: VALID_SM,
      NumMedia: 0,
    } as InboundSmsWebhook);

    expect(messagesRepo.findThreadByPair(userGuid, "+15559990000", "+15554443333")).toBeDefined();
    expect(broadcasts.filter((b) => b.type === "message.added")).toHaveLength(1);
  });

  it("on first message: inserts a Message activity + sets thread.activityId", () => {
    svc.handleInboundSms({
      From: "+15554443333",
      To: "+15559990000",
      Body: "hey",
      MessageSid: VALID_SM,
      NumMedia: 0,
    } as InboundSmsWebhook);

    expect(broadcasts.filter((b) => b.type === "activity.added")).toHaveLength(1);
    const thread = messagesRepo.findThreadByPair(userGuid, "+15559990000", "+15554443333");
    expect(thread?.activityId).toBeDefined();
  });

  it("is idempotent on webhook retry (same MessageSid)", () => {
    const args = {
      From: "+15554443333",
      To: "+15559990000",
      Body: "hey",
      MessageSid: VALID_SM,
      NumMedia: 0,
    } as InboundSmsWebhook;

    svc.handleInboundSms(args);
    broadcasts.length = 0;
    svc.handleInboundSms(args);
    expect(broadcasts).toHaveLength(0);
    const thread = messagesRepo.findThreadByPair(userGuid, "+15559990000", "+15554443333");
    expect(messagesRepo.getMessages(thread!.threadId)).toHaveLength(1);
  });

  it("second inbound message to same thread: no new activity", () => {
    svc.handleInboundSms({
      From: "+15554443333",
      To: "+15559990000",
      Body: "hey",
      MessageSid: VALID_SM,
      NumMedia: 0,
    } as InboundSmsWebhook);
    broadcasts.length = 0;
    svc.handleInboundSms({
      From: "+15554443333",
      To: "+15559990000",
      Body: "again",
      MessageSid: VALID_SM_2,
      NumMedia: 0,
    } as InboundSmsWebhook);

    expect(broadcasts.filter((b) => b.type === "activity.added")).toHaveLength(0);
    expect(broadcasts.filter((b) => b.type === "message.added")).toHaveLength(1);
  });
});
