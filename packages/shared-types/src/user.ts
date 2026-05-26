import { z } from "zod";
import { IsoDateString, booleanFromInt, optionalString } from "./common";

export const UserSchema = z.object({
  userGuid: z.string().uuid(),
  name: z.string().min(1),
  phone: optionalString(),
  email: optionalString(),
  twilioNumber: optionalString(),
  twilioNumberSid: optionalString(),
  active: booleanFromInt,
  created: IsoDateString,
});
export type User = z.infer<typeof UserSchema>;
