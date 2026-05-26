import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "@mobileclient/db";
import {
  AppError,
  CountryNotConfiguredError,
  TwilioRestError,
  ValidationError,
} from "@/lib/errors";
import { TwilioNumberService, countryFromE164 } from "./twilio-number-service";
import { UserService } from "./user-service";

// Mock the Twilio client module. We control what inventory.list and
// incomingPhoneNumbers.create return from inside each test.
const localList = vi.fn();
const mobileList = vi.fn();
const tollFreeList = vi.fn();
const incomingCreate = vi.fn();
const incomingRemove = vi.fn();

vi.mock("@/lib/twilio-client", () => ({
  getTwilioClient: () => ({
    availablePhoneNumbers: () => ({
      local: { list: localList },
      mobile: { list: mobileList },
      tollFree: { list: tollFreeList },
    }),
    incomingPhoneNumbers: Object.assign(
      (_sid: string) => ({ remove: incomingRemove }),
      { create: incomingCreate },
    ),
  }),
}));

let db: Database.Database;
let users: UserService;
let svc: TwilioNumberService;
let userGuid: string;

beforeEach(() => {
  db = createTestDb();
  users = new UserService(db);
  svc = new TwilioNumberService(users);
  userGuid = users.createUser({ name: "J" });
  localList.mockReset();
  mobileList.mockReset();
  tollFreeList.mockReset();
  incomingCreate.mockReset();
  incomingRemove.mockReset();
});

describe("countryFromE164", () => {
  it("recognises US", () => {
    expect(countryFromE164("+15551111111")).toBe("US");
  });
  it("recognises AU", () => {
    expect(countryFromE164("+61401234567")).toBe("AU");
  });
  it("throws on unsupported country", () => {
    expect(() => countryFromE164("+442071234567")).toThrow(AppError);
  });
  it("throws ValidationError on empty string", () => {
    expect(() => countryFromE164("")).toThrow(ValidationError);
  });
});

describe("TwilioNumberService.provisionForUser", () => {
  it("throws for countries with no dial-code mapping", async () => {
    // NZ's +64 isn't in DIAL_CODE_TO_COUNTRY
    await expect(svc.provisionForUser(userGuid, "+64211234567")).rejects.toThrow(AppError);
  });

  it("picks the local inventory for US", async () => {
    localList.mockResolvedValue([{ phoneNumber: "+15559990000" }]);
    incomingCreate.mockResolvedValue({ phoneNumber: "+15559990000", sid: "PN1" });
    const result = await svc.provisionForUser(userGuid, "+15551111111");
    expect(localList).toHaveBeenCalledOnce();
    expect(mobileList).not.toHaveBeenCalled();
    expect(result.phoneNumber).toBe("+15559990000");
  });

  it("picks the mobile inventory for AU and passes bundle + address", async () => {
    mobileList.mockResolvedValue([{ phoneNumber: "+61401234567" }]);
    incomingCreate.mockResolvedValue({ phoneNumber: "+61401234567", sid: "PN2" });
    await svc.provisionForUser(userGuid, "+61401234567");
    expect(mobileList).toHaveBeenCalledOnce();
    const args = incomingCreate.mock.calls[0]?.[0];
    expect(args.bundleSid).toBe("BU00000000000000000000000000000001");
    expect(args.addressSid).toBe("AD00000000000000000000000000000001");
  });

  it("persists phoneNumber + sid on the user", async () => {
    localList.mockResolvedValue([{ phoneNumber: "+15559990000" }]);
    incomingCreate.mockResolvedValue({ phoneNumber: "+15559990000", sid: "PN1" });
    await svc.provisionForUser(userGuid, "+15551111111");
    const u = users.getUser(userGuid);
    expect(u?.twilioNumber).toBe("+15559990000");
    expect(u?.twilioNumberSid).toBe("PN1");
  });

  it("throws AppError when inventory is empty", async () => {
    localList.mockResolvedValue([]);
    await expect(svc.provisionForUser(userGuid, "+15551111111")).rejects.toThrow(AppError);
  });

  it("wraps inventory list errors as TwilioRestError with stage=search", async () => {
    localList.mockRejectedValue({ code: 20001, message: "blown", moreInfo: "m" });
    await expect(svc.provisionForUser(userGuid, "+15551111111")).rejects.toMatchObject({
      stage: "search",
      twilioCode: 20001,
    });
  });

  it("wraps purchase errors as TwilioRestError with stage=purchase", async () => {
    localList.mockResolvedValue([{ phoneNumber: "+15559990000" }]);
    incomingCreate.mockRejectedValue({ code: 21610, message: "nope" });
    await expect(svc.provisionForUser(userGuid, "+15551111111")).rejects.toBeInstanceOf(
      TwilioRestError,
    );
  });

  it("throws CountryNotConfiguredError when country has no env config", async () => {
    // Temporarily clear the US config
    const saved = process.env.TWILIO_COUNTRY_CONFIG_US_TYPE;
    delete process.env.TWILIO_COUNTRY_CONFIG_US_TYPE;
    try {
      await expect(svc.provisionForUser(userGuid, "+15551111111")).rejects.toBeInstanceOf(
        CountryNotConfiguredError,
      );
    } finally {
      process.env.TWILIO_COUNTRY_CONFIG_US_TYPE = saved;
    }
  });
});

describe("TwilioNumberService.releaseForUser", () => {
  it("calls Twilio remove and clears the user's number fields", async () => {
    users.updateUser(userGuid, {
      twilioNumber: "+15559990000",
      twilioNumberSid: "PN1",
    });
    incomingRemove.mockResolvedValue(undefined);
    await svc.releaseForUser(userGuid);
    expect(incomingRemove).toHaveBeenCalledOnce();
    const u = users.getUser(userGuid);
    expect(u?.twilioNumber).toBeUndefined();
    expect(u?.twilioNumberSid).toBeUndefined();
  });

  it("is a no-op when user has no provisioned number", async () => {
    await svc.releaseForUser(userGuid);
    expect(incomingRemove).not.toHaveBeenCalled();
  });

  it("wraps remove errors as TwilioRestError with stage=release", async () => {
    users.updateUser(userGuid, {
      twilioNumber: "+15559990000",
      twilioNumberSid: "PN1",
    });
    incomingRemove.mockRejectedValue({ code: 20404, message: "not found" });
    await expect(svc.releaseForUser(userGuid)).rejects.toMatchObject({
      stage: "release",
      twilioCode: 20404,
    });
  });
});
