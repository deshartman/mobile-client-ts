import { z } from "zod";
import { UserSchema } from "../user";

export const PhoneE164 = z.string().regex(/^\+[1-9]\d{1,14}$/);

export const SendOtpRequestSchema = z.object({
  phone: PhoneE164,
});
export type SendOtpRequest = z.infer<typeof SendOtpRequestSchema>;

export const SendOtpResponseSchema = z.object({
  sent: z.boolean(),
  isExistingUser: z.boolean(),
});
export type SendOtpResponse = z.infer<typeof SendOtpResponseSchema>;

export const VerifyOtpRequestSchema = z.object({
  phone: PhoneE164,
  code: z.string().regex(/^\d{6}$/),
});
export type VerifyOtpRequest = z.infer<typeof VerifyOtpRequestSchema>;

export const VerifyOtpResponseSchema = z.object({
  verified: z.boolean(),
  isExistingUser: z.boolean(),
});
export type VerifyOtpResponse = z.infer<typeof VerifyOtpResponseSchema>;

export const CompleteAuthRequestSchema = z.object({
  phone: PhoneE164,
  name: z.string().min(1).optional(),
});
export type CompleteAuthRequest = z.infer<typeof CompleteAuthRequestSchema>;

export const CompleteAuthResponseSchema = z.object({
  userGuid: z.string().uuid(),
  user: UserSchema,
});
export type CompleteAuthResponse = z.infer<typeof CompleteAuthResponseSchema>;
