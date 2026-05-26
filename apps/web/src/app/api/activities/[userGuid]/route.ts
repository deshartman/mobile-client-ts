import { z } from "zod";
import { ActivityKindSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { errorResponse, parseJson } from "@/lib/http";

export const runtime = "nodejs";

const AddActivityRequestSchema = z.object({
  type: ActivityKindSchema,
  datetime: z.string().optional(),
  duration: z.number().int().nonnegative().optional(),
  identityValue: z.string().nullable().optional(),
  contactGuid: z.string().nullable().optional(),
  callSid: z.string().nullable().optional(),
});

interface Params {
  params: Promise<{ userGuid: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { userGuid } = await params;
  try {
    const activities = getServices().contactService.getActivities(userGuid);
    return Response.json(activities);
  } catch (err) {
    return errorResponse(err, `api/activities/${userGuid}`);
  }
}

export async function POST(req: Request, { params }: Params) {
  const { userGuid } = await params;
  const parsed = await parseJson(req, AddActivityRequestSchema);
  if (parsed instanceof Response) return parsed;
  try {
    const activity = getServices().contactService.addActivity(userGuid, parsed);
    return Response.json(activity, { status: 201 });
  } catch (err) {
    return errorResponse(err, `api/activities/${userGuid}`);
  }
}
