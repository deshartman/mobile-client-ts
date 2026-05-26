import { CreateContactRequestSchema } from "@mobileclient/shared-types";
import { getServices } from "@/lib/container";
import { errorResponse, parseJson } from "@/lib/http";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ userGuid: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { userGuid } = await params;
  try {
    const contacts = getServices().contactService.getContacts(userGuid);
    return Response.json(contacts);
  } catch (err) {
    return errorResponse(err, `api/contacts/${userGuid}`);
  }
}

export async function POST(req: Request, { params }: Params) {
  const { userGuid } = await params;
  const parsed = await parseJson(req, CreateContactRequestSchema);
  if (parsed instanceof Response) return parsed;
  try {
    const contact = getServices().contactService.createContact(userGuid, parsed);
    return Response.json(contact, { status: 201 });
  } catch (err) {
    return errorResponse(err, `api/contacts/${userGuid}`);
  }
}
