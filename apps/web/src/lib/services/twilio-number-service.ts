import { loadCountryConfig, type CountryConfig } from "@mobileclient/shared-types";
import { env } from "../env";
import {
  AppError,
  CountryNotConfiguredError,
  ValidationError,
  wrapTwilioError,
} from "../errors";
import { logOut } from "../logger";
import { getTwilioClient, type TwilioClient } from "../twilio-client";
import type { UserService } from "./user-service";

const DIAL_CODE_TO_COUNTRY: ReadonlyArray<readonly [string, string]> = [
  ["+61", "AU"],
  ["+1", "US"],
];

function countryFromE164(phone: string): string {
  if (!phone) throw new ValidationError("Invalid phone");
  for (const [prefix, country] of DIAL_CODE_TO_COUNTRY) {
    if (phone.startsWith(prefix)) return country;
  }
  throw new AppError(`Unsupported country for phone ${phone}`, 400, { phone });
}

function normaliseOrigin(url: string): string {
  const hasScheme = /^https?:\/\//.test(url);
  return (hasScheme ? url : `http://${url}`).replace(/\/$/, "");
}

export interface ProvisionResult {
  phoneNumber: string;
  sid: string;
  country: string;
}

export class TwilioNumberService {
  private readonly smsUrl: string;
  private readonly voiceUrl: string;
  private readonly statusCallbackUrl: string;

  constructor(private readonly userService: UserService) {
    const origin = normaliseOrigin(env.SERVER_BASE_URL);
    this.smsUrl = `${origin}/api/webhooks/messaging/inbound`;
    this.voiceUrl = `${origin}/api/voice/incoming`;
    this.statusCallbackUrl = `${origin}/api/webhooks/voice/status`;
  }

  async provisionForUser(userGuid: string, signupPhone: string): Promise<ProvisionResult> {
    const country = countryFromE164(signupPhone);
    const config = loadCountryConfig(country, process.env);
    if (!config) throw new CountryNotConfiguredError(country);

    logOut(
      "TwilioNumberService",
      `Provisioning ${country} ${config.type} number for user ${userGuid} (signup=${signupPhone})`,
    );

    const client = getTwilioClient();
    const purchased = await this.searchAndPurchase(client, country, config);

    logOut(
      "TwilioNumberService",
      `Purchased ${purchased.phoneNumber} (sid=${purchased.sid}) for ${userGuid}`,
    );

    this.userService.updateUser(userGuid, {
      twilioNumber: purchased.phoneNumber,
      twilioNumberSid: purchased.sid,
    });

    return { phoneNumber: purchased.phoneNumber, sid: purchased.sid, country };
  }

  private async searchAndPurchase(
    client: TwilioClient,
    country: string,
    config: CountryConfig,
  ): Promise<{ phoneNumber: string; sid: string }> {
    const inventory = client.availablePhoneNumbers(country);

    let available;
    try {
      const params = { smsEnabled: true, voiceEnabled: true, limit: 1 };
      switch (config.type) {
        case "local":
          available = await inventory.local.list(params);
          break;
        case "mobile":
          available = await inventory.mobile.list(params);
          break;
        case "tollFree":
          available = await inventory.tollFree.list(params);
          break;
      }
    } catch (err) {
      throw wrapTwilioError(err, "search");
    }

    const first = available[0];
    if (!first?.phoneNumber) {
      throw new AppError(
        `No SMS+Voice ${config.type} numbers available in ${country}`,
        503,
        { country, type: config.type },
      );
    }

    const purchaseArgs: Parameters<typeof client.incomingPhoneNumbers.create>[0] = {
      phoneNumber: first.phoneNumber,
      smsUrl: this.smsUrl,
      voiceUrl: this.voiceUrl,
      statusCallback: this.statusCallbackUrl,
    };
    if (config.bundleSid) purchaseArgs.bundleSid = config.bundleSid;
    if (config.addressSid) purchaseArgs.addressSid = config.addressSid;

    try {
      const purchased = await client.incomingPhoneNumbers.create(purchaseArgs);
      return { phoneNumber: purchased.phoneNumber, sid: purchased.sid };
    } catch (err) {
      throw wrapTwilioError(err, "purchase");
    }
  }

  async releaseForUser(userGuid: string): Promise<void> {
    const user = this.userService.getUser(userGuid);
    if (!user?.twilioNumberSid) {
      logOut("TwilioNumberService", `Release skipped for ${userGuid} (no number)`);
      return;
    }
    const sid = user.twilioNumberSid;
    const client = getTwilioClient();

    try {
      await client.incomingPhoneNumbers(sid).remove();
      logOut(
        "TwilioNumberService",
        `Released ${user.twilioNumber} (sid=${sid}) from user ${userGuid}`,
      );
    } catch (err) {
      throw wrapTwilioError(err, "release");
    }

    this.userService.updateUser(userGuid, {
      twilioNumber: null,
      twilioNumberSid: null,
    });
  }
}

export { countryFromE164 };
