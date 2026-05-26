import { getDb } from "@mobileclient/db";
import { getServices } from "@/lib/container";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ userGuid: string; activityId: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { userGuid, activityId } = await params;
  try {
    const row = getDb()
      .prepare("SELECT call_sid FROM activities WHERE user_guid = ? AND id = ?")
      .get(userGuid, activityId) as { call_sid: string | null } | undefined;

    if (!row?.call_sid) {
      return Response.json({ correlationSid: null, utterances: [] });
    }
    const utterances = getServices().transcriptionsRepo.getByCorrelationSid(row.call_sid);
    return Response.json({ correlationSid: row.call_sid, utterances });
  } catch (err) {
    return errorResponse(err, `api/activities/${userGuid}/${activityId}/transcript`);
  }
}
