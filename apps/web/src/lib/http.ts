import type { ZodError, ZodSchema } from "zod";
import { isAppError } from "./errors";
import { logError } from "./logger";

export function errorResponse(err: unknown, tag: string): Response {
  if (isAppError(err)) {
    logError(tag, `${err.name}: ${err.message}`);
    const body: { error: string; details?: Record<string, unknown> } = { error: err.message };
    if (err.details) body.details = err.details;
    return Response.json(body, { status: err.status });
  }
  const msg = err instanceof Error ? err.message : String(err);
  logError(tag, msg);
  return Response.json({ error: msg }, { status: 500 });
}

export function zodErrorResponse(err: ZodError): Response {
  return Response.json({ error: "Invalid request body", details: err.flatten() }, { status: 400 });
}

export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  return parsed.data;
}
