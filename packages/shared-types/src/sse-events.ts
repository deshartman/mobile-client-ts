import { z } from "zod";
import { ActivitySchema } from "./activity";
import { MessageSchema, MessageStatusSchema } from "./message";

export const IncomingCallPayloadSchema = z.object({
  callSid: z.string().regex(/^CA[a-f0-9]{32}$/i),
  from: z.string().min(1),
});
export type IncomingCallPayload = z.infer<typeof IncomingCallPayloadSchema>;

export const MessageStatusPayloadSchema = z.object({
  messageSid: z.string().regex(/^SM[a-f0-9]{32}$/i),
  threadId: z.string().min(1),
  status: MessageStatusSchema,
});
export type MessageStatusPayload = z.infer<typeof MessageStatusPayloadSchema>;

export const ThreadReadPayloadSchema = z.object({
  threadId: z.string().min(1),
  remoteAddress: z.string().min(1),
  contactGuid: z.string().optional(),
  readAt: z.string().min(1),
});
export type ThreadReadPayload = z.infer<typeof ThreadReadPayloadSchema>;

export const VideoGuestJoinedPayloadSchema = z.object({
  roomSid: z.string().regex(/^RM[a-f0-9]{32}$/i),
  roomName: z.string().min(1),
  guestIdentity: z.string().min(1),
  displayName: z.string().min(1).optional(),
});
export type VideoGuestJoinedPayload = z.infer<typeof VideoGuestJoinedPayloadSchema>;

export const VideoEndedPayloadSchema = z.object({
  roomSid: z.string().regex(/^RM[a-f0-9]{32}$/i),
  roomName: z.string().min(1),
});
export type VideoEndedPayload = z.infer<typeof VideoEndedPayloadSchema>;

export const SseEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("activity.added"),
    userGuid: z.string().uuid(),
    payload: ActivitySchema,
  }),
  z.object({
    type: z.literal("message.added"),
    userGuid: z.string().uuid(),
    payload: MessageSchema,
  }),
  z.object({
    type: z.literal("message.status"),
    userGuid: z.string().uuid(),
    payload: MessageStatusPayloadSchema,
  }),
  z.object({
    type: z.literal("incoming-call"),
    userGuid: z.string().uuid(),
    payload: IncomingCallPayloadSchema,
  }),
  z.object({
    type: z.literal("thread.read"),
    userGuid: z.string().uuid(),
    payload: ThreadReadPayloadSchema,
  }),
  z.object({
    type: z.literal("video.guestJoined"),
    userGuid: z.string().uuid(),
    payload: VideoGuestJoinedPayloadSchema,
  }),
  z.object({
    type: z.literal("video.ended"),
    userGuid: z.string().uuid(),
    payload: VideoEndedPayloadSchema,
  }),
]);
export type SseEvent = z.infer<typeof SseEventSchema>;

export type SseEventType = SseEvent["type"];
