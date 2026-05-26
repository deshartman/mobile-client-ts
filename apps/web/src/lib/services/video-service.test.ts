import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "@mobileclient/db";
import type { SseEvent } from "@mobileclient/shared-types";
import { AppError, NotFoundError, ValidationError } from "@/lib/errors";
import { ContactService } from "./contact-service";
import { MessagesRepository } from "./messages-repository";
import { MessagingService } from "./messaging-service";
import { SseService } from "./sse-service";
import { TranscriptionsRepository } from "./transcriptions-repository";
import { UserService } from "./user-service";
import { VideoInvitesRepository } from "./video-invites-repository";
import { VideoService } from "./video-service";

const messagesCreateMock = vi.fn();
const roomsCreateMock = vi.fn();
const roomsUpdateMock = vi.fn();
vi.mock("@/lib/twilio-client", () => ({
  getTwilioClient: () => ({
    messages: { create: messagesCreateMock },
    video: {
      v1: {
        rooms: Object.assign(
          (sid: string) => ({
            update: (opts: unknown) => roomsUpdateMock(sid, opts),
          }),
          { create: roomsCreateMock },
        ),
      },
    },
  }),
}));

const VALID_RM = "RM00000000000000000000000000000099";
const VALID_PA = "PA00000000000000000000000000000077";

let db: Database.Database;
let users: UserService;
let contacts: ContactService;
let messagesRepo: MessagesRepository;
let sse: SseService;
let invitesRepo: VideoInvitesRepository;
let transcriptionsRepo: TranscriptionsRepository;
let messagingService: MessagingService;
let svc: VideoService;
let userGuid: string;
let broadcasts: SseEvent[];

beforeEach(() => {
  db = createTestDb();
  users = new UserService(db);
  messagesRepo = new MessagesRepository(db);
  sse = new SseService();
  broadcasts = [];
  sse.broadcast = vi.fn((event: SseEvent) => {
    broadcasts.push(event);
  });
  contacts = new ContactService(db, messagesRepo, sse);
  invitesRepo = new VideoInvitesRepository(db);
  transcriptionsRepo = new TranscriptionsRepository(db);
  messagingService = new MessagingService(contacts, users, messagesRepo, sse);
  svc = new VideoService(
    users,
    invitesRepo,
    transcriptionsRepo,
    contacts,
    messagingService,
    sse,
  );
  userGuid = users.createUser({ name: "Broker", twilioNumber: "+15559990000" });

  messagesCreateMock.mockReset();
  messagesCreateMock.mockResolvedValue({
    sid: "SM11111111111111111111111111111111",
    status: "queued",
    dateCreated: new Date("2026-05-05T10:00:00Z"),
  });
  roomsCreateMock.mockReset();
  roomsCreateMock.mockResolvedValue({ sid: VALID_RM, uniqueName: "video-foo" });
  roomsUpdateMock.mockReset();
  roomsUpdateMock.mockResolvedValue(undefined);
});

describe("VideoService.startVideoCall", () => {
  it("rejects missing fields", async () => {
    await expect(
      svc.startVideoCall({ userGuid: "", remoteAddress: "+15554443333" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError for unknown user", async () => {
    await expect(
      svc.startVideoCall({
        userGuid: "00000000-0000-4000-8000-000000000000",
        remoteAddress: "+15554443333",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("creates a room, persists an invite, sends SMS, returns broker token", async () => {
    const result = await svc.startVideoCall({
      userGuid,
      remoteAddress: "+15554443333",
    });
    expect(result.roomSid).toBe(VALID_RM);
    expect(result.identity).toBe(userGuid);
    expect(result.token.split(".").length).toBe(3);
    expect(result.inviteUrl).toContain(`/v/${result.inviteToken}`);
    expect(roomsCreateMock).toHaveBeenCalledOnce();
    expect(messagesCreateMock).toHaveBeenCalledOnce();
    const persisted = invitesRepo.findByRoomSid(VALID_RM);
    expect(persisted?.inviteToken).toBe(result.inviteToken);
  });
});

describe("VideoService.validateInvite", () => {
  it("throws NotFoundError for unknown token", () => {
    expect(() => svc.validateInvite("nope-nope-nope-nope-nope-nope-nope-nope-nope-nope")).toThrow(
      NotFoundError,
    );
  });

  // validateInvite is intentionally permissive on consumedAt — Next.js may
  // re-fetch /v/<token> as an RSC prefetch after the guest has already
  // redeemed and joined. The single-use guard lives in redeemGuestInvite's
  // atomic markConsumed.
  it("does not throw on consumed invite (single-use enforced in redeem)", async () => {
    const r = await svc.startVideoCall({ userGuid, remoteAddress: "+15554443333" });
    invitesRepo.markConsumed(r.inviteToken, new Date().toISOString());
    expect(() => svc.validateInvite(r.inviteToken)).not.toThrow();
  });

  it("returns the invite when usable", async () => {
    const r = await svc.startVideoCall({ userGuid, remoteAddress: "+15554443333" });
    expect(svc.validateInvite(r.inviteToken).roomSid).toBe(VALID_RM);
  });
});

describe("VideoService.redeemGuestInvite", () => {
  it("first call returns a token, second call throws (single-use)", async () => {
    const r = await svc.startVideoCall({ userGuid, remoteAddress: "+15554443333" });
    const out = svc.redeemGuestInvite({ inviteToken: r.inviteToken });
    expect(out.identity).toMatch(/^guest-[a-f0-9]+$/);
    expect(out.token.split(".").length).toBe(3);

    expect(() => svc.redeemGuestInvite({ inviteToken: r.inviteToken })).toThrow(AppError);
  });

  it("broadcasts video.guestJoined SSE", async () => {
    const r = await svc.startVideoCall({ userGuid, remoteAddress: "+15554443333" });
    svc.redeemGuestInvite({ inviteToken: r.inviteToken, displayName: "Alex" });
    const evt = broadcasts.find((e) => e.type === "video.guestJoined");
    expect(evt?.payload).toMatchObject({
      roomSid: VALID_RM,
      displayName: "Alex",
    });
  });
});

describe("VideoService.completeVideoCall", () => {
  it("calls Twilio rooms(sid).update completed", async () => {
    const r = await svc.startVideoCall({ userGuid, remoteAddress: "+15554443333" });
    await svc.completeVideoCall(r.inviteToken);
    expect(roomsUpdateMock).toHaveBeenCalledWith(VALID_RM, { status: "completed" });
  });

  it("treats Twilio 4xx as success", async () => {
    const r = await svc.startVideoCall({ userGuid, remoteAddress: "+15554443333" });
    roomsUpdateMock.mockRejectedValueOnce(Object.assign(new Error("not found"), { status: 404 }));
    await expect(svc.completeVideoCall(r.inviteToken)).resolves.toBeUndefined();
  });
});

describe("VideoService.handleRoomEndedWebhook", () => {
  it("creates Activity + broadcasts video.ended on first call only", async () => {
    const r = await svc.startVideoCall({ userGuid, remoteAddress: "+15554443333" });
    invitesRepo.markGuestJoined(r.inviteToken, new Date(Date.now() - 60_000).toISOString());

    svc.handleRoomEndedWebhook(VALID_RM);
    svc.handleRoomEndedWebhook(VALID_RM); // idempotent

    const ended = broadcasts.filter((e) => e.type === "video.ended");
    expect(ended.length).toBe(1);
    const acts = contacts.getActivities(userGuid);
    expect(acts.find((a) => a.type === "Video")?.callSid).toBe(VALID_RM);
  });
});

describe("VideoService.ingestVideoTranscription", () => {
  it("inserts a row keyed on (roomSid, sequenceNumber) with source=video", async () => {
    const r = await svc.startVideoCall({ userGuid, remoteAddress: "+15554443333" });
    const out = svc.ingestVideoTranscription({
      inviteToken: r.inviteToken,
      roomSid: VALID_RM,
      participantSid: VALID_PA,
      transcript: "Hello",
      sequenceNumber: 1,
      timestamp: "2026-05-05T10:00:00Z",
    });
    expect(out.inserted).toBe(true);
    const rows = transcriptionsRepo.getByCorrelationSid(VALID_RM);
    expect(rows[0]?.source).toBe("video");
    expect(rows[0]?.participantSid).toBe(VALID_PA);
  });

  it("dedupes duplicate sequence numbers (composite PK)", async () => {
    const r = await svc.startVideoCall({ userGuid, remoteAddress: "+15554443333" });
    const args = {
      inviteToken: r.inviteToken,
      roomSid: VALID_RM,
      participantSid: VALID_PA,
      transcript: "Hi",
      sequenceNumber: 1,
      timestamp: "2026-05-05T10:00:00Z",
    };
    expect(svc.ingestVideoTranscription(args).inserted).toBe(true);
    expect(svc.ingestVideoTranscription(args).inserted).toBe(false);
  });

  it("rejects mismatched roomSid (defense in depth)", async () => {
    const r = await svc.startVideoCall({ userGuid, remoteAddress: "+15554443333" });
    expect(() =>
      svc.ingestVideoTranscription({
        inviteToken: r.inviteToken,
        roomSid: "RM00000000000000000000000000000fff",
        participantSid: VALID_PA,
        transcript: "X",
        sequenceNumber: 2,
        timestamp: "2026-05-05T10:00:00Z",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects unknown invite token", () => {
    expect(() =>
      svc.ingestVideoTranscription({
        inviteToken: "nope-nope-nope-nope-nope-nope-nope-nope-nope-nope",
        roomSid: VALID_RM,
        participantSid: VALID_PA,
        transcript: "X",
        sequenceNumber: 1,
        timestamp: "2026-05-05T10:00:00Z",
      }),
    ).toThrow(NotFoundError);
  });
});
