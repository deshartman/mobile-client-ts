import { z } from "zod";
import { getServices } from "@/lib/container";
import { NotFoundError } from "@/lib/errors";
import { errorResponse, parseJson } from "@/lib/http";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";

const UpdateUserRequestSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  twilioNumber: z.string().nullable().optional(),
  twilioNumberSid: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

interface Params {
  params: Promise<{ userGuid: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { userGuid } = await params;
  try {
    const user = getServices().userService.getUser(userGuid);
    if (!user) throw new NotFoundError(`User not found: ${userGuid}`);
    return Response.json(user);
  } catch (err) {
    return errorResponse(err, `api/users/${userGuid}`);
  }
}

export async function PUT(req: Request, { params }: Params) {
  const { userGuid } = await params;
  const parsed = await parseJson(req, UpdateUserRequestSchema);
  if (parsed instanceof Response) return parsed;
  try {
    const user = getServices().userService.updateUser(userGuid, parsed);
    return Response.json(user);
  } catch (err) {
    return errorResponse(err, `api/users/${userGuid}`);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { userGuid } = await params;
  const { userService, twilioNumberService } = getServices();
  try {
    try {
      await twilioNumberService.releaseForUser(userGuid);
    } catch (releaseErr) {
      const msg = releaseErr instanceof Error ? releaseErr.message : String(releaseErr);
      logError(`api/users/${userGuid}`, `Number release failed (continuing with user delete): ${msg}`);
    }
    userService.deleteUser(userGuid);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err, `api/users/${userGuid}`);
  }
}
