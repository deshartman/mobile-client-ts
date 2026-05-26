import { z } from "zod";
import { ContactIdentitySchema, ContactSchema } from "../contact";
import { optionalString } from "../common";

export const CreateContactRequestSchema = z.object({
  firstName: optionalString(),
  lastName: optionalString(),
  company: optionalString(),
  photoData: optionalString(),
  identities: z.array(ContactIdentitySchema).min(1),
});
export type CreateContactRequest = z.infer<typeof CreateContactRequestSchema>;

export const UpdateContactRequestSchema = CreateContactRequestSchema.partial().extend({
  identities: z.array(ContactIdentitySchema).optional(),
});
export type UpdateContactRequest = z.infer<typeof UpdateContactRequestSchema>;

export const ContactResponseSchema = ContactSchema;
export type ContactResponse = z.infer<typeof ContactResponseSchema>;

export const ContactListResponseSchema = z.array(ContactSchema);
export type ContactListResponse = z.infer<typeof ContactListResponseSchema>;
