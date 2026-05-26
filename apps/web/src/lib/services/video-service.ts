import { randomBytes } from "node:crypto";
import twilio from "twilio";
import { env } from "../env";
import { AppError, NotFoundError, ValidationError, wrapTwilioError } from "../errors";
import { logOut } from "../logger";
import { getTwilioClient } from "../twilio-client";
import type { ContactService } from "./contact-service";
import type { MessagingService } from "./messaging-service";
import type { SseService } from "./sse-service";
import type { TranscriptionsRepository } from "./transcriptions-repository";
import type { UserService } from "./user-service";
import type { VideoInvitesRepository } from "./video-invites-repository";

const { AccessToken } = twilio.jwt;
const { VideoGrant } = AccessToken;

const ROOM_PARTICIPANTS_MAX = 2;
// Twilio's UnusedRoomTimeout is expressed in minutes (range 1-60, default 5).
// Five minutes matches the legacy aussie behavior.
const ROOM_UNUSED_TIMEOUT_MIN = 5;

function normaliseOrigin(url: string): string {
  const hasScheme = /^https?:\/\//.test(url);
  return (hasScheme ? url : `http://${url}`).replace(/\/$/, "");
}

function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

function generateRoomName(): string {
  return `video-${randomBytes(16).toString("hex")}`;
}

function generateGuestIdentity(): string {
  return `guest-${randomBytes(4).toString("hex")}`;
}

function isStillActive(invite: { consumedAt?: string; endedAt?: string; expiresAt: string }): boolean {
  if (invite.consumedAt) return false;
  if (invite.endedAt) return false;
  if (new Date(invite.expiresAt).getTime() < Date.now()) return false;
  return true;
}

export interface StartVideoCallInput {
  userGuid: string;
  contactGuid?: string;
  remoteAddress: string;
}

export interface StartVideoCallResult {
  token: string;
  identity: string;
  roomName: string;
  roomSid: string;
  inviteToken: string;
  inviteUrl: string;
  expiresAt: string;
}

export interface RedeemGuestInviteInput {
  inviteToken: string;
  displayName?: string;
}

export interface RedeemGuestInviteResult {
  token: string;
  identity: string;
  roomName: string;
}

export interface IngestVideoTranscriptionInput {
  inviteToken: string;
  roomSid: string;
  participantSid: string;
  transcript: string;
  sequenceNumber: number;
  timestamp: string;
}

/**
 * 1:1 broker-initiated video calls. Broker taps Video on a contact → server
 * creates a Twilio Group Room, persists a single-use invite, sends the contact
 * an SMS with a /v/<token> link. Either side's hangup hits completeVideoCall()
 * which forcibly ends the room; Twilio's room-ended webhook then logs the
 * Activity row + broadcasts video.ended via SSE.
 *
 * Activity-logged unlike the legacy aussie implementation, so a Video activity
 * shows up in contact history and can be drilled into for transcripts.
 */
export class VideoService {
  constructor(
    private readonly userService: UserService,
    private readonly invitesRepo: VideoInvitesRepository,
    private readonly transcriptionsRepo: TranscriptionsRepository,
    private readonly contactService: ContactService,
    private readonly messagingService: MessagingService,
    private readonly sseService: SseService,
  ) {}

  async startVideoCall(input: StartVideoCallInput): Promise<StartVideoCallResult> {
    if (!input.userGuid || !input.remoteAddress) {
      throw new ValidationError("Missing required fields: userGuid, remoteAddress");
    }
    const user = this.userService.getUser(input.userGuid);
    if (!user) throw new NotFoundError(`User not found: ${input.userGuid}`);

    const origin = normaliseOrigin(env.SERVER_BASE_URL);
    const roomName = generateRoomName();
    const statusCallback = `${origin}/api/webhooks/video/status`;

    const transcriptionEngine = env.TRANSCRIPTION_ENGINE;
    const languageCode = env.TRANSCRIPTION_LANGUAGE_CODE ?? "en-US";

    type RoomCreateOpts = Parameters<
      ReturnType<typeof getTwilioClient>["video"]["v1"]["rooms"]["create"]
    >[0];
    const roomOpts: RoomCreateOpts = {
      uniqueName: roomName,
      type: "group",
      maxParticipants: ROOM_PARTICIPANTS_MAX,
      unusedRoomTimeout: ROOM_UNUSED_TIMEOUT_MIN,
      statusCallback,
      statusCallbackMethod: "POST",
    };
    if (transcriptionEngine) {
      (roomOpts as Record<string, unknown>).transcribeParticipantsOnConnect = true;
      (roomOpts as Record<string, unknown>).transcriptionsConfiguration = {
        languageCode,
        transcriptionEngine,
        partialResults: false,
      };
    }

    let room: { sid: string; uniqueName?: string | null };
    try {
      room = await getTwilioClient().video.v1.rooms.create(roomOpts);
    } catch (err) {
      throw wrapTwilioError(err, "video.rooms.create");
    }

    const inviteToken = generateInviteToken();
    const ttlMinutes = env.VIDEO_INVITE_TTL_MINUTES;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);

    this.invitesRepo.insert({
      inviteToken,
      userGuid: input.userGuid,
      contactGuid: input.contactGuid ?? null,
      remoteAddress: input.remoteAddress,
      roomSid: room.sid,
      roomName,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    const inviteUrl = `${origin}/v/${inviteToken}`;
    const smsBody = `${user.name} is inviting you to a video call: ${inviteUrl}`;

    try {
      await this.messagingService.sendMessage({
        userGuid: input.userGuid,
        remoteAddress: input.remoteAddress,
        body: smsBody,
        contactGuid: input.contactGuid,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logOut("VideoService", `SMS send failed for invite ${inviteToken}: ${msg}`);
      throw err;
    }

    const grant = new VideoGrant({ room: roomName });
    const accessToken = new AccessToken(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_API_KEY,
      env.TWILIO_API_SECRET,
      { identity: input.userGuid, ttl: 3600 },
    );
    accessToken.addGrant(grant);

    logOut(
      "VideoService",
      `Video call started: ${room.sid} (${roomName}), broker=${input.userGuid}, contact=${input.remoteAddress}`,
    );

    return {
      token: accessToken.toJwt(),
      identity: input.userGuid,
      roomName,
      roomSid: room.sid,
      inviteToken,
      inviteUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Pre-validates an invite for the GET /v/[token] page. Throws on
   * missing/expired/ended invites so the page can render an error state.
   *
   * Intentionally permissive on `consumedAt`: the page may be re-fetched
   * (Next.js prefetch, RSC refresh, history pop) after the guest has
   * already redeemed and joined the room — rejecting consumed invites
   * here would tear down the in-call UI on a stale prefetch. The actual
   * single-use guard lives in `redeemGuestInvite` (atomic markConsumed).
   */
  validateInvite(inviteToken: string) {
    const invite = this.invitesRepo.findByToken(inviteToken);
    if (!invite) throw new NotFoundError("Invite not found");
    if (invite.endedAt) throw new AppError("Call already ended", 410);
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      throw new AppError("Invite expired", 410);
    }
    return invite;
  }

  redeemGuestInvite(input: RedeemGuestInviteInput): RedeemGuestInviteResult {
    const invite = this.invitesRepo.findByToken(input.inviteToken);
    if (!invite) throw new NotFoundError("Invite not found");
    if (invite.endedAt) throw new AppError("Call already ended", 410);
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      throw new AppError("Invite expired", 410);
    }

    const nowIso = new Date().toISOString();
    const claimed = this.invitesRepo.markConsumed(input.inviteToken, nowIso);
    if (!claimed) throw new AppError("Invite already used", 410);

    this.invitesRepo.markGuestJoined(input.inviteToken, nowIso);

    const guestIdentity = generateGuestIdentity();
    const grant = new VideoGrant({ room: invite.roomName });
    const accessToken = new AccessToken(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_API_KEY,
      env.TWILIO_API_SECRET,
      { identity: guestIdentity, ttl: 3600 },
    );
    accessToken.addGrant(grant);

    this.sseService.broadcast({
      type: "video.guestJoined",
      userGuid: invite.userGuid,
      payload: {
        roomSid: invite.roomSid,
        roomName: invite.roomName,
        guestIdentity,
        ...(input.displayName ? { displayName: input.displayName } : {}),
      },
    });

    logOut(
      "VideoService",
      `Guest redeemed invite for room ${invite.roomSid}: identity=${guestIdentity}`,
    );

    return {
      token: accessToken.toJwt(),
      identity: guestIdentity,
      roomName: invite.roomName,
    };
  }

  async completeVideoCall(inviteToken: string): Promise<void> {
    const invite = this.invitesRepo.findByToken(inviteToken);
    if (!invite) throw new NotFoundError("Invite not found");
    if (invite.endedAt) return;

    try {
      await getTwilioClient().video.v1.rooms(invite.roomSid).update({ status: "completed" });
    } catch (err) {
      // Treat 404 / 4xx (room already gone or completed) as success: the goal
      // is "room is over", and Twilio's room-ended webhook will fire either way.
      const status = (err as { status?: number; statusCode?: number }).status
        ?? (err as { status?: number; statusCode?: number }).statusCode;
      if (typeof status === "number" && status >= 400 && status < 500) {
        logOut(
          "VideoService",
          `completeVideoCall: room ${invite.roomSid} already gone (HTTP ${status}) — treated as success`,
        );
        return;
      }
      throw wrapTwilioError(err, "video.rooms.complete");
    }
  }

  /**
   * Idempotent. Twilio retries the room-ended webhook; only the first call
   * creates the Activity row + broadcasts SSE.
   */
  handleRoomEndedWebhook(roomSid: string): void {
    const invite = this.invitesRepo.findByRoomSid(roomSid);
    if (!invite) {
      logOut("VideoService", `room-ended webhook: no invite found for ${roomSid} — ignored`);
      return;
    }
    const nowIso = new Date().toISOString();
    const firstClose = this.invitesRepo.markEnded(roomSid, nowIso);
    if (!firstClose) return;

    let durationMinutes = 0;
    if (invite.guestJoinedAt) {
      const ms = Date.now() - new Date(invite.guestJoinedAt).getTime();
      durationMinutes = Math.max(0, Math.round(ms / 60_000));
    }

    this.contactService.addActivity(invite.userGuid, {
      type: "Video",
      datetime: nowIso,
      duration: durationMinutes,
      identityValue: invite.remoteAddress,
      contactGuid: invite.contactGuid ?? null,
      callSid: invite.roomSid,
    });

    this.sseService.broadcast({
      type: "video.ended",
      userGuid: invite.userGuid,
      payload: { roomSid: invite.roomSid, roomName: invite.roomName },
    });

    logOut(
      "VideoService",
      `Video call ended: ${roomSid} (duration=${durationMinutes}m, broker=${invite.userGuid})`,
    );
  }

  /**
   * Browser-side ingest of a final transcription utterance from the Twilio
   * Video JS SDK. Auth is the inviteToken; both broker and guest browsers
   * call this, so duplicate (roomSid, sequenceNumber) pairs are expected and
   * deduped by the composite PK in `transcriptions`.
   */
  ingestVideoTranscription(input: IngestVideoTranscriptionInput): { inserted: boolean } {
    const invite = this.invitesRepo.findByToken(input.inviteToken);
    if (!invite) throw new NotFoundError("Invite not found");
    if (invite.roomSid !== input.roomSid) {
      throw new ValidationError("roomSid does not match invite");
    }

    const inserted = this.transcriptionsRepo.insertIfAbsent({
      correlationSid: invite.roomSid,
      sequenceId: input.sequenceNumber,
      transcript: input.transcript,
      datetime: input.timestamp,
      source: "video",
      participantSid: input.participantSid,
    });
    return { inserted };
  }
}
