import { z } from "zod";

export const VoiceTokenRequestSchema = z.object({
  userGuid: z.string().uuid(),
});
export type VoiceTokenRequest = z.infer<typeof VoiceTokenRequestSchema>;

export const VoiceTokenResponseSchema = z.object({
  token: z.string().min(1),
  identity: z.string().min(1),
});
export type VoiceTokenResponse = z.infer<typeof VoiceTokenResponseSchema>;

export const DestinationTypeSchema = z.enum(["phone", "assistant", "flex", "custom"]);
export type DestinationType = z.infer<typeof DestinationTypeSchema>;
