import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { rowToCamel } from "@mobileclient/db";
import { UserSchema, type User } from "@mobileclient/shared-types";
import { NotFoundError } from "../errors";
import { logOut } from "../logger";

export interface CreateUserInput {
  name: string;
  phone?: string;
  email?: string;
  twilioNumber?: string;
  twilioNumberSid?: string;
  active?: boolean;
  created?: string;
}

export interface UpdateUserPatch {
  name?: string;
  phone?: string | null;
  email?: string | null;
  twilioNumber?: string | null;
  twilioNumberSid?: string | null;
  active?: boolean;
}

function toUser(row: Record<string, unknown>): User {
  return UserSchema.parse(rowToCamel(row));
}

export class UserService {
  private readonly getByGuidStmt;
  private readonly getByPhoneStmt;
  private readonly getByEmailStmt;
  private readonly getByTwilioNumberStmt;
  private readonly insertStmt;
  private readonly updateStmt;
  private readonly deleteStmt;

  constructor(private readonly db: Database.Database) {
    this.getByGuidStmt = db.prepare("SELECT * FROM users WHERE user_guid = ?");
    this.getByPhoneStmt = db.prepare("SELECT * FROM users WHERE phone = ?");
    this.getByEmailStmt = db.prepare("SELECT * FROM users WHERE email = ?");
    this.getByTwilioNumberStmt = db.prepare(
      "SELECT * FROM users WHERE twilio_number = ?",
    );
    this.insertStmt = db.prepare(
      `INSERT INTO users
         (user_guid, name, phone, email, twilio_number, twilio_number_sid, active, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.updateStmt = db.prepare(
      `UPDATE users
         SET name = ?, phone = ?, email = ?, twilio_number = ?, twilio_number_sid = ?, active = ?
       WHERE user_guid = ?`,
    );
    this.deleteStmt = db.prepare("DELETE FROM users WHERE user_guid = ?");
  }

  createUser(input: CreateUserInput): string {
    const userGuid = uuidv4();
    const created = input.created ?? new Date().toISOString();
    this.insertStmt.run(
      userGuid,
      input.name,
      input.phone ?? null,
      input.email ?? null,
      input.twilioNumber ?? null,
      input.twilioNumberSid ?? null,
      input.active === false ? 0 : 1,
      created,
    );
    logOut(
      "UserService",
      `Created user ${userGuid} (phone=${input.phone ?? "n/a"}, email=${input.email ?? "n/a"})`,
    );
    return userGuid;
  }

  getUser(userGuid: string): User | undefined {
    const row = this.getByGuidStmt.get(userGuid) as Record<string, unknown> | undefined;
    return row ? toUser(row) : undefined;
  }

  getUserByPhone(phone: string): { userGuid: string; user: User } | undefined {
    if (!phone) return undefined;
    const row = this.getByPhoneStmt.get(phone) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return { userGuid: row.user_guid as string, user: toUser(row) };
  }

  getUserByEmail(email: string): { userGuid: string; user: User } | undefined {
    if (!email) return undefined;
    const row = this.getByEmailStmt.get(email) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return { userGuid: row.user_guid as string, user: toUser(row) };
  }

  getUserByTwilioNumber(e164: string): { userGuid: string; user: User } | undefined {
    if (!e164) return undefined;
    const row = this.getByTwilioNumberStmt.get(e164) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return { userGuid: row.user_guid as string, user: toUser(row) };
  }

  updateUser(userGuid: string, patch: UpdateUserPatch): User {
    const existing = this.getByGuidStmt.get(userGuid) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundError(`User not found: ${userGuid}`);

    const name = patch.name ?? (existing.name as string);
    const phone = patch.phone !== undefined ? patch.phone : (existing.phone as string | null);
    const email = patch.email !== undefined ? patch.email : (existing.email as string | null);
    const twilioNumber = patch.twilioNumber !== undefined ? patch.twilioNumber : (existing.twilio_number as string | null);
    const twilioNumberSid = patch.twilioNumberSid !== undefined ? patch.twilioNumberSid : (existing.twilio_number_sid as string | null);
    const active = patch.active !== undefined ? (patch.active ? 1 : 0) : (existing.active as number);

    this.updateStmt.run(name, phone, email, twilioNumber, twilioNumberSid, active, userGuid);
    const updated = this.getUser(userGuid);
    if (!updated) throw new NotFoundError(`User disappeared mid-update: ${userGuid}`);
    return updated;
  }

  deleteUser(userGuid: string): string {
    this.deleteStmt.run(userGuid);
    return userGuid;
  }
}
