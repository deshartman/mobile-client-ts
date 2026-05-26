import type Database from "better-sqlite3";
import { rowToCamel } from "@mobileclient/db";
import { VideoInviteSchema, type VideoInvite } from "@mobileclient/shared-types";

export interface InsertVideoInviteInput {
  inviteToken: string;
  userGuid: string;
  contactGuid?: string | null;
  remoteAddress: string;
  roomSid: string;
  roomName: string;
  createdAt: string;
  expiresAt: string;
}

function toInvite(row: Record<string, unknown>): VideoInvite {
  return VideoInviteSchema.parse(rowToCamel(row));
}

export class VideoInvitesRepository {
  private readonly insertStmt;
  private readonly selectByTokenStmt;
  private readonly selectByRoomSidStmt;
  private readonly markConsumedStmt;
  private readonly markGuestJoinedStmt;
  private readonly markEndedStmt;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO video_invites
          (invite_token, user_guid, contact_guid, remote_address,
           room_sid, room_name, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.selectByTokenStmt = db.prepare(
      "SELECT * FROM video_invites WHERE invite_token = ?",
    );
    this.selectByRoomSidStmt = db.prepare(
      "SELECT * FROM video_invites WHERE room_sid = ?",
    );
    this.markConsumedStmt = db.prepare(
      `UPDATE video_invites SET consumed_at = ?
        WHERE invite_token = ? AND consumed_at IS NULL`,
    );
    this.markGuestJoinedStmt = db.prepare(
      `UPDATE video_invites SET guest_joined_at = ?
        WHERE invite_token = ? AND guest_joined_at IS NULL`,
    );
    this.markEndedStmt = db.prepare(
      `UPDATE video_invites SET ended_at = ?
        WHERE room_sid = ? AND ended_at IS NULL`,
    );
  }

  insert(input: InsertVideoInviteInput): VideoInvite {
    this.insertStmt.run(
      input.inviteToken,
      input.userGuid,
      input.contactGuid ?? null,
      input.remoteAddress,
      input.roomSid,
      input.roomName,
      input.createdAt,
      input.expiresAt,
    );
    const created = this.findByToken(input.inviteToken);
    if (!created) throw new Error(`VideoInvite insert failed: ${input.inviteToken}`);
    return created;
  }

  findByToken(inviteToken: string): VideoInvite | undefined {
    const row = this.selectByTokenStmt.get(inviteToken) as Record<string, unknown> | undefined;
    return row ? toInvite(row) : undefined;
  }

  findByRoomSid(roomSid: string): VideoInvite | undefined {
    const row = this.selectByRoomSidStmt.get(roomSid) as Record<string, unknown> | undefined;
    return row ? toInvite(row) : undefined;
  }

  /**
   * Atomic single-use claim. Returns true on first call, false on every subsequent
   * call — even under concurrent guest tabs. Caller must treat false as "already used".
   */
  markConsumed(inviteToken: string, nowIso: string): boolean {
    const result = this.markConsumedStmt.run(nowIso, inviteToken);
    return result.changes > 0;
  }

  markGuestJoined(inviteToken: string, nowIso: string): boolean {
    const result = this.markGuestJoinedStmt.run(nowIso, inviteToken);
    return result.changes > 0;
  }

  /** Idempotent — Twilio retries the room-ended webhook. */
  markEnded(roomSid: string, nowIso: string): boolean {
    const result = this.markEndedStmt.run(nowIso, roomSid);
    return result.changes > 0;
  }
}
