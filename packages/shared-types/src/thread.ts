import { z } from "zod";
import { IsoDateString, optionalString } from "./common";

export const ThreadSchema = z.object({
  threadId: z.string().min(1),
  userGuid: z.string().uuid(),
  contactGuid: optionalString(),
  remoteAddress: z.string().min(1),
  proxyAddress: z.string().min(1),
  activityId: optionalString(),
  created: IsoDateString,
});
export type Thread = z.infer<typeof ThreadSchema>;
