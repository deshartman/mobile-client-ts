import { getServices } from "@/lib/container";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ userGuid: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { userGuid } = await params;
  try {
    const rows = getServices().contactService.getMainList(userGuid);
    return Response.json(rows);
  } catch (err) {
    return errorResponse(err, `api/main-list/${userGuid}`);
  }
}
