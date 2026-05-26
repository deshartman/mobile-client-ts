import { z } from "zod";
import { IsoDateString, optionalString } from "./common";

export const ActivityKindSchema = z.enum(["Phone", "Message", "WhatsApp", "Contact", "Video"]);
export type ActivityKind = z.infer<typeof ActivityKindSchema>;

export const ActivitySchema = z.object({
  id: z.string().uuid(),
  userGuid: z.string().uuid(),
  type: ActivityKindSchema,
  datetime: IsoDateString,
  duration: z.number().int().nonnegative().default(0),
  identityValue: optionalString(),
  contactGuid: optionalString(),
  callSid: optionalString(),
});
export type Activity = z.infer<typeof ActivitySchema>;
