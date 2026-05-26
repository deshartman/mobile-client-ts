import { z } from "zod";
import { ContactIdentitySchema } from "./contact";
import { optionalString } from "./common";

export const MainListContactRowSchema = z.object({
  kind: z.literal("contact"),
  guid: z.string(),
  firstName: optionalString(),
  lastName: optionalString(),
  company: optionalString(),
  photoData: optionalString(),
  identities: z.array(ContactIdentitySchema),
  identityValue: z.undefined().optional(),
  lastInteractedAt: optionalString(),
  unreadCount: z.number().int().nonnegative(),
});
export type MainListContactRow = z.infer<typeof MainListContactRowSchema>;

export const MainListUnknownRowSchema = z.object({
  kind: z.literal("unknown"),
  guid: z.undefined().optional(),
  firstName: z.undefined().optional(),
  lastName: z.undefined().optional(),
  company: z.undefined().optional(),
  photoData: z.undefined().optional(),
  identities: z.tuple([]),
  identityValue: z.string(),
  lastInteractedAt: optionalString(),
  unreadCount: z.number().int().nonnegative(),
});
export type MainListUnknownRow = z.infer<typeof MainListUnknownRowSchema>;

export const MainListRowSchema = z.discriminatedUnion("kind", [
  MainListContactRowSchema,
  MainListUnknownRowSchema,
]);
export type MainListRow = z.infer<typeof MainListRowSchema>;
