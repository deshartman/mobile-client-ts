import { z } from "zod";
import { IsoDateString, optionalNumber, optionalString } from "./common";

export const TranscriptionTrackSchema = z.enum(["inbound_track", "outbound_track"]);
export type TranscriptionTrack = z.infer<typeof TranscriptionTrackSchema>;

export const TranscriptionSourceSchema = z.enum(["voice", "video"]);
export type TranscriptionSource = z.infer<typeof TranscriptionSourceSchema>;

const CallSidPattern = /^CA[a-f0-9]{32}$/i;
const RoomSidPattern = /^RM[a-f0-9]{32}$/i;
const ParticipantSidPattern = /^PA[a-f0-9]{32}$/i;

export const TranscriptionSchema = z
  .object({
    correlationSid: z.string().min(1),
    sequenceId: z.number().int().nonnegative(),
    track: TranscriptionTrackSchema.nullish().transform((v) => v ?? undefined),
    transcript: z.string(),
    confidence: optionalNumber(),
    datetime: IsoDateString,
    source: TranscriptionSourceSchema.default("voice"),
    participantSid: optionalString(),
  })
  .superRefine((val, ctx) => {
    const expected = val.source === "video" ? RoomSidPattern : CallSidPattern;
    if (!expected.test(val.correlationSid)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correlationSid"],
        message: `correlationSid must match ${val.source === "video" ? "RM…" : "CA…"} pattern for source=${val.source}`,
      });
    }
    if (val.participantSid !== undefined && !ParticipantSidPattern.test(val.participantSid)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participantSid"],
        message: "participantSid must match PA… pattern",
      });
    }
  });
export type Transcription = z.infer<typeof TranscriptionSchema>;
