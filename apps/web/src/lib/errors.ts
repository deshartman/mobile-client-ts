/**
 * Shape-discriminator. `instanceof AppError` is unreliable across Next.js
 * HMR boundaries because the class identity can differ between the throw
 * site and the catch site. Use `isAppError(err)` instead.
 */
const APP_ERROR_BRAND = Symbol.for("@mobileclient/AppError");

export class AppError extends Error {
  readonly [APP_ERROR_BRAND] = true;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, status = 500, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.details = details;
  }
}

export function isAppError(err: unknown): err is AppError {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as Record<PropertyKey, unknown>)[APP_ERROR_BRAND] === true
  );
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 401, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 404, details);
  }
}

export class OtpExpiredError extends AppError {
  constructor(message = "Code expired") {
    super(message, 410);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many attempts") {
    super(message, 429);
  }
}

export class TwilioRestError extends AppError {
  readonly twilioCode?: number;
  readonly moreInfo?: string;
  readonly stage?: string;

  constructor(
    message: string,
    opts: { twilioCode?: number; moreInfo?: string; stage?: string } = {},
  ) {
    super(message, 502, {
      twilioCode: opts.twilioCode,
      moreInfo: opts.moreInfo,
      stage: opts.stage,
    });
    this.twilioCode = opts.twilioCode;
    this.moreInfo = opts.moreInfo;
    this.stage = opts.stage;
  }
}

export class CountryNotConfiguredError extends AppError {
  readonly country: string;

  constructor(country: string) {
    super(
      `No provisioning config for country ${country}. Set TWILIO_COUNTRY_CONFIG_${country}_TYPE in .env`,
      400,
      { country },
    );
    this.country = country;
  }
}

export interface TwilioSdkError {
  code?: number;
  message: string;
  moreInfo?: string;
}

export function wrapTwilioError(err: unknown, stage: string): TwilioRestError {
  const e = err as TwilioSdkError;
  return new TwilioRestError(`[${stage}] ${e?.message ?? "Twilio error"}`, {
    twilioCode: typeof e?.code === "number" ? e.code : undefined,
    moreInfo: e?.moreInfo,
    stage,
  });
}
