import type Database from "better-sqlite3";
import { createHash, randomInt } from "node:crypto";
import { env } from "../env";
import {
  OtpExpiredError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "../errors";
import { logOut } from "../logger";
import { getTwilioClient } from "../twilio-client";
import type { TwilioNumberService } from "./twilio-number-service";
import type { UserService } from "./user-service";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const E164 = /^\+[1-9]\d{7,14}$/;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface RequestOtpResult {
  isExistingUser: boolean;
}

export interface VerifyOtpResult {
  verified: true;
  isExistingUser: boolean;
}

export interface CompleteAuthResult {
  userGuid: string;
}

interface OtpRow {
  phone: string;
  code_hash: string;
  attempts: number;
  created_at: string;
  expires_at: string;
  verified: number;
}

export class AuthService {
  private readonly getOtpStmt;
  private readonly upsertOtpStmt;
  private readonly incrementAttemptsStmt;
  private readonly markVerifiedStmt;
  private readonly deleteOtpStmt;

  constructor(
    db: Database.Database,
    private readonly userService: UserService,
    private readonly twilioNumberService: TwilioNumberService,
  ) {
    this.getOtpStmt = db.prepare("SELECT * FROM otp_verifications WHERE phone = ?");
    this.upsertOtpStmt = db.prepare(`
      INSERT INTO otp_verifications (phone, code_hash, attempts, created_at, expires_at, verified)
      VALUES (?, ?, 0, ?, ?, 0)
      ON CONFLICT(phone) DO UPDATE SET
        code_hash = excluded.code_hash,
        attempts = 0,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at,
        verified = 0
    `);
    this.incrementAttemptsStmt = db.prepare(
      "UPDATE otp_verifications SET attempts = attempts + 1 WHERE phone = ?",
    );
    this.markVerifiedStmt = db.prepare(
      "UPDATE otp_verifications SET verified = 1 WHERE phone = ?",
    );
    this.deleteOtpStmt = db.prepare("DELETE FROM otp_verifications WHERE phone = ?");
  }

  private validatePhone(phone: string): void {
    if (!phone || !E164.test(phone)) {
      throw new ValidationError("Phone must be in E.164 format (e.g. +15551234567)");
    }
  }

  async requestOtp(phone: string): Promise<RequestOtpResult> {
    this.validatePhone(phone);

    const code = generateCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    this.upsertOtpStmt.run(phone, hashCode(code), now.toISOString(), expiresAt.toISOString());

    await getTwilioClient().messages.create({
      to: phone,
      from: env.OTP_FROM_NUMBER,
      body: `Your verification code is ${code}. It expires in 10 minutes.`,
    });

    const isExistingUser = !!this.userService.getUserByPhone(phone);
    logOut("AuthService", `OTP sent to ${phone} (isExistingUser=${isExistingUser})`);
    return { isExistingUser };
  }

  verifyOtp(phone: string, code: string): VerifyOtpResult {
    this.validatePhone(phone);
    if (!/^\d{6}$/.test(code)) throw new ValidationError("Code must be 6 digits");

    const row = this.getOtpStmt.get(phone) as OtpRow | undefined;
    if (!row) throw new UnauthorizedError("No verification pending for this phone");

    if (new Date(row.expires_at).getTime() < Date.now()) {
      this.deleteOtpStmt.run(phone);
      throw new OtpExpiredError();
    }
    if (row.attempts >= MAX_ATTEMPTS) throw new RateLimitedError();

    if (hashCode(code) !== row.code_hash) {
      this.incrementAttemptsStmt.run(phone);
      throw new UnauthorizedError("Invalid code");
    }

    this.markVerifiedStmt.run(phone);
    const isExistingUser = !!this.userService.getUserByPhone(phone);
    logOut("AuthService", `OTP verified for ${phone} (isExistingUser=${isExistingUser})`);
    return { verified: true, isExistingUser };
  }

  async completeAuth(phone: string, name?: string): Promise<CompleteAuthResult> {
    this.validatePhone(phone);

    const row = this.getOtpStmt.get(phone) as OtpRow | undefined;
    if (!row || row.verified !== 1) {
      throw new UnauthorizedError("No verified OTP for this phone");
    }

    const existing = this.userService.getUserByPhone(phone);
    if (existing) {
      this.deleteOtpStmt.run(phone);
      logOut("AuthService", `Signin complete for ${phone} → ${existing.userGuid}`);
      return { userGuid: existing.userGuid };
    }

    if (!name?.trim()) throw new ValidationError("Name is required for new users");

    const userGuid = this.userService.createUser({ name: name.trim(), phone });
    try {
      await this.twilioNumberService.provisionForUser(userGuid, phone);
    } catch (err) {
      this.userService.deleteUser(userGuid);
      throw err;
    }

    this.deleteOtpStmt.run(phone);
    logOut("AuthService", `Signup complete for ${phone} → ${userGuid}`);
    return { userGuid };
  }
}
