import { getServices } from "@/lib/container";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ userGuid: string; identityValue: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { userGuid, identityValue } = await params;
  const decoded = decodeURIComponent(identityValue);
  try {
    const activities = getServices().contactService.getActivities(userGuid, { identityValue: decoded });
    return Response.json(activities);
  } catch (err) {
    return errorResponse(err, `api/activities/${userGuid}/by-identity`);
  }
}
