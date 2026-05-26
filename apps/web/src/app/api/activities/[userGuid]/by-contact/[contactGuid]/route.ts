import { getServices } from "@/lib/container";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ userGuid: string; contactGuid: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { userGuid, contactGuid } = await params;
  try {
    const activities = getServices().contactService.getActivities(userGuid, { contactGuid });
    return Response.json(activities);
  } catch (err) {
    return errorResponse(err, `api/activities/${userGuid}/by-contact/${contactGuid}`);
  }
}
