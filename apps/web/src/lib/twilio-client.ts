import twilio from "twilio";
import { env } from "./env";
import { AppError } from "./errors";
import { logOut } from "./logger";

export type TwilioClient = ReturnType<typeof twilio>;

const globalForTwilio = globalThis as unknown as { __twilioClient?: TwilioClient };

export function getTwilioClient(): TwilioClient {
  if (globalForTwilio.__twilioClient) return globalForTwilio.__twilioClient;

  if (!env.TWILIO_AUTH_TOKEN) {
    throw new AppError(
      "TWILIO_AUTH_TOKEN is not set — REST client unavailable. Set the env var or use dev-only code paths.",
      500,
    );
  }

  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  globalForTwilio.__twilioClient = client;
  logOut("twilio-client", `Initialised REST client for ${env.TWILIO_ACCOUNT_SID}`);
  return client;
}
