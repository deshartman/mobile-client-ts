import { z } from "zod";
import { IsoDateString, optionalNumber, optionalString } from "./common";

export const MessageDirectionSchema = z.enum(["inbound", "outbound"]);
export type MessageDirection = z.infer<typeof MessageDirectionSchema>;

export const MessageStatusSchema = z.enum([
  "queued",
  "sent",
  "delivered",
  "failed",
  "undelivered",
]);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const MessageSchema = z.object({
  messageSid: z.string().regex(/^SM[a-f0-9]{32}$/i),
  threadId: z.string().min(1),
  direction: MessageDirectionSchema,
  author: optionalString(),
  body: optionalString(),
  datetime: IsoDateString,
  idx: optionalNumber(),
  status: MessageStatusSchema.nullish().transform((v) => v ?? undefined),
  readAt: optionalString(),
});
export type Message = z.infer<typeof MessageSchema>;
