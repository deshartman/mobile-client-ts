import { z } from "zod";
import { optionalString } from "./common";

export const IdentityTypeSchema = z.enum(["Phone", "Message", "WhatsApp", "SIP", "Client"]);
export type IdentityType = z.infer<typeof IdentityTypeSchema>;

export const ContactIdentitySchema = z.object({
  type: IdentityTypeSchema,
  value: z.string().min(1),
});
export type ContactIdentity = z.infer<typeof ContactIdentitySchema>;

export const ContactSchema = z.object({
  contactGuid: z.string().min(1),
  userGuid: z.string().uuid(),
  firstName: optionalString(),
  lastName: optionalString(),
  company: optionalString(),
  photoData: optionalString(),
  identities: z.array(ContactIdentitySchema).default([]),
});
export type Contact = z.infer<typeof ContactSchema>;
