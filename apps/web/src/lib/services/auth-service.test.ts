import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "@mobileclient/db";
import {
  OtpExpiredError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";
import { AuthService } from "./auth-service";
import { UserService } from "./user-service";

// Twilio client mock — captures messages.create calls; throws on demand.
const messagesCreateMock = vi.fn();
vi.mock("@/lib/twilio-client", () => ({
  getTwilioClient: () => ({
    messages: { create: messagesCreateMock },
  }),
}));

// TwilioNumberService mock — provisionForUser is a spy; fails when asked to.
const provisionMock = vi.fn();
const releaseMock = vi.fn();
const twilioNumberService = {
  provisionForUser: provisionMock,
  releaseForUser: releaseMock,
} as unknown as ConstructorParameters<typeof AuthService>[2];

let db: Database.Database;
let users: UserService;
let auth: AuthService;

beforeEach(() => {
  db = createTestDb();
  users = new UserService(db);
  auth = new AuthService(db, users, twilioNumberService);
  messagesCreateMock.mockReset();
  messagesCreateMock.mockResolvedValue({ sid: "SMxxxxx" });
  provisionMock.mockReset();
  provisionMock.mockResolvedValue({ phoneNumber: "+15559990000", sid: "PN1", country: "US" });
  releaseMock.mockReset();
});

describe("AuthService.requestOtp", () => {
  it("rejects non-E.164 phone", async () => {
    await expect(auth.requestOtp("bad")).rejects.toThrow(ValidationError);
    await expect(auth.requestOtp("+1 bad")).rejects.toThrow(ValidationError);
  });

  it("upserts an OTP row and sends SMS", async () => {
    const result = await auth.requestOtp("+15551111111");
    expect(messagesCreateMock).toHaveBeenCalledOnce();
    const call = messagesCreateMock.mock.calls[0]?.[0];
    expect(call.to).toBe("+15551111111");
    expect(call.from).toBe("+15551234567"); // test env's OTP_FROM_NUMBER
    expect(call.body).toMatch(/verification code is \d{6}/);
    expect(result.isExistingUser).toBe(false);
  });

  it("overwrites a prior pending OTP for the same phone", async () => {
    await auth.requestOtp("+15551111111");
    await auth.requestOtp("+15551111111");
    const rows = db.prepare("SELECT * FROM otp_verifications WHERE phone='+15551111111'").all();
    expect(rows).toHaveLength(1);
  });

  it("reports isExistingUser=true when user exists", async () => {
    users.createUser({ name: "J", phone: "+15551111111" });
    const result = await auth.requestOtp("+15551111111");
    expect(result.isExistingUser).toBe(true);
  });
});

describe("AuthService.verifyOtp", () => {
  it("rejects non-E.164 phone", () => {
    expect(() => auth.verifyOtp("bad", "123456")).toThrow(ValidationError);
  });

  it("rejects non-6-digit code", () => {
    expect(() => auth.verifyOtp("+15551111111", "12345")).toThrow(ValidationError);
    expect(() => auth.verifyOtp("+15551111111", "abcdef")).toThrow(ValidationError);
  });

  it("throws UnauthorizedError when no pending OTP", () => {
    expect(() => auth.verifyOtp("+15551111111", "123456")).toThrow(UnauthorizedError);
  });

  it("throws OtpExpiredError past expiry", async () => {
    await auth.requestOtp("+15551111111");
    db.prepare(
      "UPDATE otp_verifications SET expires_at = '2000-01-01T00:00:00Z' WHERE phone='+15551111111'",
    ).run();
    expect(() => auth.verifyOtp("+15551111111", "000000")).toThrow(OtpExpiredError);
  });

  it("throws RateLimitedError after 5 attempts", async () => {
    await auth.requestOtp("+15551111111");
    db.prepare(
      "UPDATE otp_verifications SET attempts = 5 WHERE phone='+15551111111'",
    ).run();
    expect(() => auth.verifyOtp("+15551111111", "000000")).toThrow(RateLimitedError);
  });

  it("throws UnauthorizedError on wrong code and increments attempts", async () => {
    await auth.requestOtp("+15551111111");
    expect(() => auth.verifyOtp("+15551111111", "000000")).toThrow(UnauthorizedError);
    const row = db
      .prepare("SELECT attempts FROM otp_verifications WHERE phone='+15551111111'")
      .get() as { attempts: number };
    expect(row.attempts).toBe(1);
  });

  it("marks verified and reports isExistingUser correctly", async () => {
    users.createUser({ name: "J", phone: "+15551111111" });
    await auth.requestOtp("+15551111111");

    // Pull the actual code out by mocking generateCode indirectly — we have to
    // compute it by reading the stored hash. Simpler: bypass the hash check by
    // setting it to a known value and verifying with that code.
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update("123456").digest("hex");
    db.prepare("UPDATE otp_verifications SET code_hash = ? WHERE phone='+15551111111'").run(hash);

    const result = auth.verifyOtp("+15551111111", "123456");
    expect(result).toEqual({ verified: true, isExistingUser: true });

    const row = db
      .prepare("SELECT verified FROM otp_verifications WHERE phone='+15551111111'")
      .get() as { verified: number };
    expect(row.verified).toBe(1);
  });
});

describe("AuthService.completeAuth", () => {
  async function verifyOtpFor(phone: string) {
    await auth.requestOtp(phone);
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update("123456").digest("hex");
    db.prepare("UPDATE otp_verifications SET code_hash = ? WHERE phone = ?").run(hash, phone);
    auth.verifyOtp(phone, "123456");
  }

  it("rejects non-E.164 phone", async () => {
    await expect(auth.completeAuth("bad")).rejects.toThrow(ValidationError);
  });

  it("throws UnauthorizedError when no verified OTP", async () => {
    await expect(auth.completeAuth("+15551111111", "J")).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when OTP pending but not verified", async () => {
    await auth.requestOtp("+15551111111");
    await expect(auth.completeAuth("+15551111111", "J")).rejects.toThrow(UnauthorizedError);
  });

  it("signs in an existing user and clears the OTP", async () => {
    const guid = users.createUser({ name: "Existing", phone: "+15551111111" });
    await verifyOtpFor("+15551111111");
    const result = await auth.completeAuth("+15551111111");
    expect(result.userGuid).toBe(guid);

    const leftover = db.prepare("SELECT * FROM otp_verifications WHERE phone='+15551111111'").all();
    expect(leftover).toEqual([]);
  });

  it("signup: requires non-empty name for new users", async () => {
    await verifyOtpFor("+15551111111");
    await expect(auth.completeAuth("+15551111111")).rejects.toThrow(ValidationError);
    await expect(auth.completeAuth("+15551111111", "   ")).rejects.toThrow(ValidationError);
  });

  it("signup: creates the user then provisions a number", async () => {
    await verifyOtpFor("+15551111111");
    const result = await auth.completeAuth("+15551111111", "John");
    expect(result.userGuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(provisionMock).toHaveBeenCalledOnce();
    expect(provisionMock).toHaveBeenCalledWith(result.userGuid, "+15551111111");
  });

  it("signup: rolls back the user when provisioning fails", async () => {
    provisionMock.mockRejectedValueOnce(new Error("no numbers available"));
    await verifyOtpFor("+15551111111");
    await expect(auth.completeAuth("+15551111111", "John")).rejects.toThrow(
      "no numbers available",
    );
    // No orphaned user with that phone
    expect(users.getUserByPhone("+15551111111")).toBeUndefined();
  });
});
