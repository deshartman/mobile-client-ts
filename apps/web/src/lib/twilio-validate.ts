import twilio from "twilio";
import { env } from "./env";
import { logError } from "./logger";

export interface TwilioFormResult {
  params: URLSearchParams;
  raw: string;
}

/**
 * Validate a Twilio webhook request and return its form-decoded params.
 *
 * Returns null if the signature is missing or invalid → caller should 403.
 * When TWILIO_AUTH_TOKEN is unset (dev without ngrok stability) the check
 * is bypassed — never deploy to prod without the token set.
 *
 * Reads the body exactly once; caller must not call req.text()/formData().
 */
export async function readTwilioForm(req: Request): Promise<TwilioFormResult | null> {
  const raw = await req.text();
  const params = new URLSearchParams(raw);

  const authToken = env.TWILIO_AUTH_TOKEN;
  if (!authToken) return { params, raw };

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    logError("twilio-validate", "Missing X-Twilio-Signature header");
    return null;
  }

  const requestUrl = new URL(req.url);
  const url = `${env.SERVER_BASE_URL.replace(/\/$/, "")}${requestUrl.pathname}${requestUrl.search}`;
  const paramsObj = Object.fromEntries(params);

  if (!twilio.validateRequest(authToken, signature, url, paramsObj)) {
    logError("twilio-validate", `Signature validation failed for ${url}`);
    return null;
  }

  return { params, raw };
}

export function twimlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/xml" },
  });
}

export const EMPTY_TWIML = "<Response/>";
export const FORBIDDEN_TWIML = "<Response><Say>Unauthorized</Say></Response>";
