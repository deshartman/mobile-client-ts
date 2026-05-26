import { z } from "zod";
import { IsoDateString, optionalString } from "./common";

const RoomSidPattern = /^RM[a-f0-9]{32}$/i;
const ParticipantSidPattern = /^PA[a-f0-9]{32}$/i;
const InviteTokenPattern = /^[A-Za-z0-9_-]{40,}$/;

export const VideoInviteSchema = z.object({
  inviteToken: z.string().regex(InviteTokenPattern),
  userGuid: z.string().uuid(),
  contactGuid: optionalString(),
  remoteAddress: z.string().min(1),
  roomSid: z.string().regex(RoomSidPattern),
  roomName: z.string().min(1),
  createdAt: IsoDateString,
  expiresAt: IsoDateString,
  consumedAt: optionalString(),
  endedAt: optionalString(),
  guestJoinedAt: optionalString(),
});
export type VideoInvite = z.infer<typeof VideoInviteSchema>;

export const StartVideoRequestSchema = z.object({
  userGuid: z.string().uuid(),
  contactGuid: z.string().min(1).optional(),
  remoteAddress: z.string().min(1),
});
export type StartVideoRequest = z.infer<typeof StartVideoRequestSchema>;

export const StartVideoResponseSchema = z.object({
  token: z.string().min(1),
  identity: z.string().min(1),
  roomName: z.string().min(1),
  roomSid: z.string().regex(RoomSidPattern),
  inviteToken: z.string().regex(InviteTokenPattern),
  inviteUrl: z.string().url(),
  expiresAt: IsoDateString,
});
export type StartVideoResponse = z.infer<typeof StartVideoResponseSchema>;

export const GuestTokenRequestSchema = z.object({
  inviteToken: z.string().regex(InviteTokenPattern),
  displayName: z.string().min(1).max(80).optional(),
});
export type GuestTokenRequest = z.infer<typeof GuestTokenRequestSchema>;

export const GuestTokenResponseSchema = z.object({
  token: z.string().min(1),
  identity: z.string().min(1),
  roomName: z.string().min(1),
});
export type GuestTokenResponse = z.infer<typeof GuestTokenResponseSchema>;

export const CompleteVideoRequestSchema = z.object({
  inviteToken: z.string().regex(InviteTokenPattern),
});
export type CompleteVideoRequest = z.infer<typeof CompleteVideoRequestSchema>;

export const VideoStatusWebhookSchema = z.object({
  RoomSid: z.string().regex(RoomSidPattern),
  RoomName: z.string().optional(),
  RoomStatus: z.string().optional(),
  StatusCallbackEvent: z.string().optional(),
  ParticipantSid: z.string().regex(ParticipantSidPattern).optional(),
  ParticipantIdentity: z.string().optional(),
});
export type VideoStatusWebhook = z.infer<typeof VideoStatusWebhookSchema>;

export const IngestVideoTranscriptionRequestSchema = z.object({
  inviteToken: z.string().regex(InviteTokenPattern),
  roomSid: z.string().regex(RoomSidPattern),
  participantSid: z.string().regex(ParticipantSidPattern),
  transcript: z.string().min(1),
  sequenceNumber: z.number().int().nonnegative(),
  timestamp: IsoDateString,
});
export type IngestVideoTranscriptionRequest = z.infer<typeof IngestVideoTranscriptionRequestSchema>;
