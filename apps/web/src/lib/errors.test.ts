import { describe, expect, it } from "vitest";
import {
  AppError,
  CountryNotConfiguredError,
  NotFoundError,
  OtpExpiredError,
  RateLimitedError,
  TwilioRestError,
  UnauthorizedError,
  ValidationError,
  wrapTwilioError,
} from "./errors";

describe("AppError and subclasses", () => {
  it("AppError defaults to 500", () => {
    const e = new AppError("boom");
    expect(e.status).toBe(500);
    expect(e.name).toBe("AppError");
  });

  it("AppError carries details", () => {
    const e = new AppError("boom", 418, { why: "tea" });
    expect(e.details).toEqual({ why: "tea" });
  });

  it.each([
    [ValidationError, 400, "ValidationError"],
    [UnauthorizedError, 401, "UnauthorizedError"],
    [NotFoundError, 404, "NotFoundError"],
    [OtpExpiredError, 410, "OtpExpiredError"],
    [RateLimitedError, 429, "RateLimitedError"],
  ])("%s has correct status and name", (Ctor, status, name) => {
    const e = new Ctor("x");
    expect(e.status).toBe(status);
    expect(e.name).toBe(name);
  });

  it("TwilioRestError stores twilio fields", () => {
    const e = new TwilioRestError("oops", {
      twilioCode: 21610,
      moreInfo: "https://x",
      stage: "purchase",
    });
    expect(e.status).toBe(502);
    expect(e.twilioCode).toBe(21610);
    expect(e.moreInfo).toBe("https://x");
    expect(e.stage).toBe("purchase");
  });

  it("CountryNotConfiguredError embeds the country", () => {
    const e = new CountryNotConfiguredError("AU");
    expect(e.status).toBe(400);
    expect(e.country).toBe("AU");
    expect(e.details?.country).toBe("AU");
  });

  it("all subclasses satisfy instanceof AppError", () => {
    expect(new ValidationError("x")).toBeInstanceOf(AppError);
    expect(new TwilioRestError("x", {})).toBeInstanceOf(AppError);
    expect(new CountryNotConfiguredError("AU")).toBeInstanceOf(AppError);
  });
});

describe("wrapTwilioError", () => {
  it("produces a TwilioRestError with code and stage", () => {
    const wrapped = wrapTwilioError(
      { code: 21610, message: "not a mobile number", moreInfo: "https://info" },
      "search",
    );
    expect(wrapped).toBeInstanceOf(TwilioRestError);
    expect(wrapped.twilioCode).toBe(21610);
    expect(wrapped.stage).toBe("search");
    expect(wrapped.message).toContain("[search]");
    expect(wrapped.message).toContain("not a mobile number");
  });

  it("handles missing code field", () => {
    const wrapped = wrapTwilioError({ message: "generic" }, "release");
    expect(wrapped.twilioCode).toBeUndefined();
  });

  it("tolerates completely unstructured errors", () => {
    const wrapped = wrapTwilioError(undefined, "purchase");
    expect(wrapped.message).toContain("[purchase]");
  });
});
