import { z } from "zod";
import { MessageSchema, MessageStatusSchema } from "../message";

export const SendMessageRequestSchema = z.object({
  userGuid: z.string().uuid(),
  to: z.string().min(1),
  body: z.string().min(1).max(1600),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const SendMessageResponseSchema = z.object({
  threadId: z.string().min(1),
  messageSid: z.string().regex(/^SM[a-f0-9]{32}$/i),
  status: MessageStatusSchema,
});
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

export const ThreadHydrationResponseSchema = z.object({
  threadId: z.string().min(1).optional(),
  messages: z.array(MessageSchema),
});
export type ThreadHydrationResponse = z.infer<typeof ThreadHydrationResponseSchema>;
