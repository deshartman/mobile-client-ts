import { CompleteAuthRequestSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { NotFoundError } from "@/lib/errors";
import { errorResponse, parseJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await parseJson(req, CompleteAuthRequestSchema);
  if (parsed instanceof Response) return parsed;
  try {
    const { userService, authService } = getServices();
    const { userGuid } = await authService.completeAuth(parsed.phone, parsed.name);
    const user = userService.getUser(userGuid);
    if (!user) throw new NotFoundError(`User disappeared after create: ${userGuid}`);
    return Response.json({ userGuid, user });
  } catch (err) {
    return errorResponse(err, "api/auth/complete");
  }
}
