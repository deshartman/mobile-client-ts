import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { rowToCamel } from "@mobileclient/db";
import {
  MessageSchema,
  ThreadSchema,
  type Message,
  type MessageDirection,
  type MessageStatus,
  type Thread,
} from "@mobileclient/shared-types";

export interface InsertThreadInput {
  userGuid: string;
  contactGuid?: string | null;
  remoteAddress: string;
  proxyAddress: string;
  activityId?: string | null;
}

export interface InsertMessageInput {
  messageSid: string;
  threadId: string;
  direction: MessageDirection;
  author?: string | null;
  body?: string | null;
  datetime?: string;
  index?: number | null;
  status?: MessageStatus | null;
}

export interface UnreadCountRow {
  threadId: string;
  contactGuid?: string;
  remoteAddress: string;
  unreadCount: number;
}

export interface MessageStatusUpdate {
  messageSid: string;
  threadId: string;
  userGuid: string;
  remoteAddress: string;
  proxyAddress: string;
  contactGuid?: string;
  direction: MessageDirection;
  author?: string;
  body?: string;
  datetime: string;
  status: MessageStatus;
}

function toThread(row: Record<string, unknown>): Thread {
  return ThreadSchema.parse(rowToCamel(row));
}

function toMessage(row: Record<string, unknown>): Message {
  return MessageSchema.parse(rowToCamel(row));
}

export class MessagesRepository {
  private readonly selectThreadByIdStmt;
  private readonly selectThreadByPairStmt;
  private readonly selectThreadByUserAndRemoteStmt;
  private readonly insertThreadStmt;
  private readonly updateThreadActivityStmt;
  private readonly updateThreadContactStmt;
  private readonly insertMessageStmt;
  private readonly selectMessagesForThreadStmt;
  private readonly updateMessageStatusStmt;
  private readonly selectMessageWithThreadStmt;
  private readonly selectUnreadCountsStmt;
  private readonly markThreadReadStmt;

  constructor(db: Database.Database) {
    this.selectThreadByIdStmt = db.prepare("SELECT * FROM threads WHERE thread_id = ?");
    this.selectThreadByPairStmt = db.prepare(
      "SELECT * FROM threads WHERE user_guid = ? AND proxy_address = ? AND remote_address = ?",
    );
    this.selectThreadByUserAndRemoteStmt = db.prepare(
      "SELECT * FROM threads WHERE user_guid = ? AND remote_address = ? ORDER BY created DESC LIMIT 1",
    );
    this.insertThreadStmt = db.prepare(
      `INSERT INTO threads
          (thread_id, user_guid, contact_guid, remote_address, proxy_address, activity_id, created)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.updateThreadActivityStmt = db.prepare(
      "UPDATE threads SET activity_id = ? WHERE thread_id = ?",
    );
    this.updateThreadContactStmt = db.prepare(
      "UPDATE threads SET contact_guid = ? WHERE thread_id = ?",
    );

    this.insertMessageStmt = db.prepare(
      `INSERT OR IGNORE INTO messages
          (message_sid, thread_id, direction, author, body, datetime, idx, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.selectMessagesForThreadStmt = db.prepare(
      "SELECT * FROM messages WHERE thread_id = ? ORDER BY datetime ASC, idx ASC",
    );
    this.updateMessageStatusStmt = db.prepare(
      "UPDATE messages SET status = ? WHERE message_sid = ?",
    );
    this.selectMessageWithThreadStmt = db.prepare(
      `SELECT m.*, t.user_guid AS t_user_guid, t.remote_address AS t_remote_address,
              t.proxy_address AS t_proxy_address, t.contact_guid AS t_contact_guid
         FROM messages m
         JOIN threads t ON t.thread_id = m.thread_id
        WHERE m.message_sid = ?`,
    );

    this.selectUnreadCountsStmt = db.prepare(`
      SELECT t.thread_id       AS thread_id,
             t.contact_guid    AS contact_guid,
             t.remote_address  AS remote_address,
             COUNT(m.message_sid) AS unread_count
        FROM threads t
        JOIN messages m ON m.thread_id = t.thread_id
       WHERE t.user_guid = ?
         AND m.direction = 'inbound'
         AND m.read_at IS NULL
       GROUP BY t.thread_id
    `);
    this.markThreadReadStmt = db.prepare(
      `UPDATE messages SET read_at = ?
        WHERE thread_id = ? AND direction = 'inbound' AND read_at IS NULL`,
    );
  }

  findThreadById(threadId: string): Thread | undefined {
    const row = this.selectThreadByIdStmt.get(threadId) as Record<string, unknown> | undefined;
    return row ? toThread(row) : undefined;
  }

  findThreadByPair(userGuid: string, proxyAddress: string, remoteAddress: string): Thread | undefined {
    const row = this.selectThreadByPairStmt.get(userGuid, proxyAddress, remoteAddress) as
      | Record<string, unknown>
      | undefined;
    return row ? toThread(row) : undefined;
  }

  findThreadByUserAndRemote(userGuid: string, remoteAddress: string): Thread | undefined {
    const row = this.selectThreadByUserAndRemoteStmt.get(userGuid, remoteAddress) as
      | Record<string, unknown>
      | undefined;
    return row ? toThread(row) : undefined;
  }

  insertThread(input: InsertThreadInput): Thread {
    const threadId = `thr_${randomUUID()}`;
    this.insertThreadStmt.run(
      threadId,
      input.userGuid,
      input.contactGuid ?? null,
      input.remoteAddress,
      input.proxyAddress,
      input.activityId ?? null,
      new Date().toISOString(),
    );
    const created = this.findThreadById(threadId);
    if (!created) throw new Error(`Thread insert failed: ${threadId}`);
    return created;
  }

  setThreadActivity(threadId: string, activityId: string): void {
    this.updateThreadActivityStmt.run(activityId, threadId);
  }

  setThreadContact(threadId: string, contactGuid: string | null): void {
    this.updateThreadContactStmt.run(contactGuid, threadId);
  }

  insertMessageIfAbsent(input: InsertMessageInput): boolean {
    const result = this.insertMessageStmt.run(
      input.messageSid,
      input.threadId,
      input.direction,
      input.author ?? null,
      input.body ?? null,
      input.datetime ?? new Date().toISOString(),
      input.index ?? null,
      input.status ?? null,
    );
    return result.changes > 0;
  }

  getMessages(threadId: string): Message[] {
    const rows = this.selectMessagesForThreadStmt.all(threadId) as Record<string, unknown>[];
    return rows.map(toMessage);
  }

  unreadCountsByThreadForUser(userGuid: string): UnreadCountRow[] {
    const rows = this.selectUnreadCountsStmt.all(userGuid) as Array<{
      thread_id: string;
      contact_guid: string | null;
      remote_address: string;
      unread_count: number;
    }>;
    return rows.map((r) => ({
      threadId: r.thread_id,
      contactGuid: r.contact_guid ?? undefined,
      remoteAddress: r.remote_address,
      unreadCount: r.unread_count,
    }));
  }

  markThreadRead(threadId: string, nowIso: string): number {
    const result = this.markThreadReadStmt.run(nowIso, threadId);
    return result.changes;
  }

  updateMessageStatus(messageSid: string, status: MessageStatus): MessageStatusUpdate | undefined {
    const result = this.updateMessageStatusStmt.run(status, messageSid);
    if (result.changes === 0) return undefined;
    const row = this.selectMessageWithThreadStmt.get(messageSid) as
      | (Record<string, unknown> & {
          t_user_guid: string;
          t_remote_address: string;
          t_proxy_address: string;
          t_contact_guid: string | null;
        })
      | undefined;
    if (!row) return undefined;
    return {
      messageSid: row.message_sid as string,
      threadId: row.thread_id as string,
      userGuid: row.t_user_guid,
      remoteAddress: row.t_remote_address,
      proxyAddress: row.t_proxy_address,
      contactGuid: row.t_contact_guid ?? undefined,
      direction: row.direction as MessageDirection,
      author: (row.author as string | null) ?? undefined,
      body: (row.body as string | null) ?? undefined,
      datetime: row.datetime as string,
      status: row.status as MessageStatus,
    };
  }
}
