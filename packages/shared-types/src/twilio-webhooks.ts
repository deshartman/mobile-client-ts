import { z } from "zod";

export const InboundSmsWebhookSchema = z.object({
  From: z.string().min(1),
  To: z.string().min(1),
  Body: z.string().default(""),
  MessageSid: z.string().regex(/^SM[a-f0-9]{32}$/i),
  NumMedia: z.coerce.number().int().nonnegative().default(0),
});
export type InboundSmsWebhook = z.infer<typeof InboundSmsWebhookSchema>;

export const VoiceStatusWebhookSchema = z.object({
  CallSid: z.string().regex(/^CA[a-f0-9]{32}$/i),
  CallStatus: z.enum([
    "queued",
    "ringing",
    "in-progress",
    "completed",
    "busy",
    "failed",
    "no-answer",
    "canceled",
  ]),
  From: z.string(),
  To: z.string(),
  DialCallStatus: z.string().optional(),
  Direction: z.string().optional(),
  Duration: z.coerce.number().int().nonnegative().optional(),
});
export type VoiceStatusWebhook = z.infer<typeof VoiceStatusWebhookSchema>;

export const TranscriptionWebhookSchema = z.object({
  TranscriptionSid: z.string(),
  CallSid: z.string().regex(/^CA[a-f0-9]{32}$/i),
  SequenceId: z.coerce.number().int().nonnegative(),
  Track: z.enum(["inbound_track", "outbound_track"]),
  TranscriptionData: z.string(),
  LanguageCode: z.string().optional(),
  Final: z.string().optional(),
  Confidence: z.coerce.number().optional(),
});
export type TranscriptionWebhook = z.infer<typeof TranscriptionWebhookSchema>;
