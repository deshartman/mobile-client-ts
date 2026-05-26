import { UpdateContactRequestSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { NotFoundError } from "@/lib/errors";
import { errorResponse, parseJson } from "@/lib/http";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ userGuid: string; contactGuid: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { userGuid, contactGuid } = await params;
  try {
    const contact = getServices().contactService.getContact(userGuid, contactGuid);
    if (!contact) throw new NotFoundError("Contact not found");
    return Response.json(contact);
  } catch (err) {
    return errorResponse(err, `api/contacts/${userGuid}/${contactGuid}`);
  }
}

export async function PUT(req: Request, { params }: Params) {
  const { userGuid, contactGuid } = await params;
  const parsed = await parseJson(req, UpdateContactRequestSchema);
  if (parsed instanceof Response) return parsed;
  try {
    const { contactService } = getServices();
    contactService.updateContact(userGuid, contactGuid, parsed);
    const contact = contactService.getContact(userGuid, contactGuid);
    if (!contact) throw new NotFoundError("Contact not found after update");
    return Response.json(contact);
  } catch (err) {
    return errorResponse(err, `api/contacts/${userGuid}/${contactGuid}`);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { userGuid, contactGuid } = await params;
  try {
    const deleted = getServices().contactService.deleteContact(userGuid, contactGuid);
    if (!deleted) throw new NotFoundError("Contact not found");
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err, `api/contacts/${userGuid}/${contactGuid}`);
  }
}
