import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "@mobileclient/db";
import { MessagesRepository } from "./messages-repository";
import { UserService } from "./user-service";

let db: Database.Database;
let repo: MessagesRepository;
let userGuid: string;

const VALID_SID_1 = "SM11111111111111111111111111111111";
const VALID_SID_2 = "SM22222222222222222222222222222222";
const VALID_SID_3 = "SM33333333333333333333333333333333";

beforeEach(() => {
  db = createTestDb();
  repo = new MessagesRepository(db);
  const users = new UserService(db);
  userGuid = users.createUser({ name: "J", twilioNumber: "+15559990000" });
});

describe("MessagesRepository.insertThread / findThread*", () => {
  it("inserts a thread and fetches it by id", () => {
    const t = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
    });
    expect(t.threadId).toMatch(/^thr_/);
    expect(repo.findThreadById(t.threadId)).toMatchObject({
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
      userGuid,
    });
  });

  it("findThreadById returns undefined for unknown id", () => {
    expect(repo.findThreadById("thr_none")).toBeUndefined();
  });

  it("findThreadByPair matches by all three keys", () => {
    const t = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
    });
    expect(repo.findThreadByPair(userGuid, "+15559990000", "+15554443333")?.threadId).toBe(
      t.threadId,
    );
    expect(repo.findThreadByPair(userGuid, "+15559990000", "+15554441111")).toBeUndefined();
  });

  it("findThreadByUserAndRemote finds a match across multiple threads for the same remote", () => {
    const older = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
    });
    const newer = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559991111",
    });
    const hit = repo.findThreadByUserAndRemote(userGuid, "+15554443333");
    expect(hit).toBeDefined();
    expect([older.threadId, newer.threadId]).toContain(hit?.threadId);
  });

  it("findThreadByUserAndRemote returns undefined when no thread exists", () => {
    expect(repo.findThreadByUserAndRemote(userGuid, "+15559999999")).toBeUndefined();
  });
});

describe("MessagesRepository.setThreadActivity / setThreadContact", () => {
  it("updates activity_id on the thread", () => {
    const t = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
    });
    const activityId = "00000000-0000-4000-8000-000000000001";
    db.prepare(
      "INSERT INTO activities (id, user_guid, type, datetime, duration) VALUES (?, ?, 'Message', ?, 0)",
    ).run(activityId, userGuid, new Date().toISOString());
    repo.setThreadActivity(t.threadId, activityId);
    expect(repo.findThreadById(t.threadId)?.activityId).toBe(activityId);
  });

  it("sets and clears contact_guid on the thread", () => {
    const t = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
    });
    db.prepare(
      "INSERT INTO contacts (contact_guid, user_guid, first_name) VALUES ('c1', ?, 'X')",
    ).run(userGuid);
    repo.setThreadContact(t.threadId, "c1");
    expect(repo.findThreadById(t.threadId)?.contactGuid).toBe("c1");
    repo.setThreadContact(t.threadId, null);
    expect(repo.findThreadById(t.threadId)?.contactGuid).toBeUndefined();
  });
});

describe("MessagesRepository.insertMessageIfAbsent", () => {
  it("inserts a new message and returns true", () => {
    const t = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
    });
    const ok = repo.insertMessageIfAbsent({
      messageSid: VALID_SID_1,
      threadId: t.threadId,
      direction: "outbound",
      body: "hi",
      datetime: "2026-05-05T10:00:00Z",
      status: "queued",
    });
    expect(ok).toBe(true);
    expect(repo.getMessages(t.threadId)).toHaveLength(1);
  });

  it("returns false on duplicate SID (webhook replay)", () => {
    const t = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
    });
    const args = {
      messageSid: VALID_SID_1,
      threadId: t.threadId,
      direction: "inbound" as const,
      body: "hi",
      datetime: "2026-05-05T10:00:00Z",
    };
    expect(repo.insertMessageIfAbsent(args)).toBe(true);
    expect(repo.insertMessageIfAbsent(args)).toBe(false);
    expect(repo.getMessages(t.threadId)).toHaveLength(1);
  });
});

describe("MessagesRepository.getMessages", () => {
  it("orders by datetime then idx", () => {
    const t = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
    });
    repo.insertMessageIfAbsent({
      messageSid: VALID_SID_2,
      threadId: t.threadId,
      direction: "outbound",
      body: "later",
      datetime: "2026-05-05T10:10:00Z",
    });
    repo.insertMessageIfAbsent({
      messageSid: VALID_SID_1,
      threadId: t.threadId,
      direction: "inbound",
      body: "earlier",
      datetime: "2026-05-05T10:00:00Z",
    });
    const messages = repo.getMessages(t.threadId);
    expect(messages.map((m) => m.body)).toEqual(["earlier", "later"]);
  });
});

describe("MessagesRepository.unreadCountsByThreadForUser", () => {
  it("counts only unread inbound messages", () => {
    const t = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
      contactGuid: null,
    });
    // two unread inbound, one outbound (ignored), one read inbound (ignored)
    repo.insertMessageIfAbsent({
      messageSid: VALID_SID_1,
      threadId: t.threadId,
      direction: "inbound",
      body: "1",
      datetime: "2026-05-05T10:00:00Z",
    });
    repo.insertMessageIfAbsent({
      messageSid: VALID_SID_2,
      threadId: t.threadId,
      direction: "inbound",
      body: "2",
      datetime: "2026-05-05T10:01:00Z",
    });
    repo.insertMessageIfAbsent({
      messageSid: VALID_SID_3,
      threadId: t.threadId,
      direction: "outbound",
      body: "3",
      datetime: "2026-05-05T10:02:00Z",
    });
    db.prepare(
      "UPDATE messages SET read_at = '2026-05-05T11:00:00Z' WHERE message_sid = ?",
    ).run(VALID_SID_1);

    const rows = repo.unreadCountsByThreadForUser(userGuid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      threadId: t.threadId,
      remoteAddress: "+15554443333",
      unreadCount: 1,
    });
  });

  it("returns empty array for user with no threads", () => {
    expect(repo.unreadCountsByThreadForUser(userGuid)).toEqual([]);
  });
});

describe("MessagesRepository.markThreadRead", () => {
  it("stamps read_at on all inbound unread rows", () => {
    const t = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
    });
    repo.insertMessageIfAbsent({
      messageSid: VALID_SID_1,
      threadId: t.threadId,
      direction: "inbound",
      body: "1",
      datetime: "2026-05-05T10:00:00Z",
    });
    repo.insertMessageIfAbsent({
      messageSid: VALID_SID_2,
      threadId: t.threadId,
      direction: "inbound",
      body: "2",
      datetime: "2026-05-05T10:01:00Z",
    });
    const count = repo.markThreadRead(t.threadId, "2026-05-05T11:00:00Z");
    expect(count).toBe(2);
    const remaining = repo.unreadCountsByThreadForUser(userGuid);
    expect(remaining).toEqual([]);
  });

  it("returns 0 when already fully read", () => {
    const t = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
    });
    expect(repo.markThreadRead(t.threadId, "2026-05-05T11:00:00Z")).toBe(0);
  });

  it("leaves outbound rows untouched", () => {
    const t = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
    });
    repo.insertMessageIfAbsent({
      messageSid: VALID_SID_1,
      threadId: t.threadId,
      direction: "outbound",
      body: "1",
      datetime: "2026-05-05T10:00:00Z",
    });
    expect(repo.markThreadRead(t.threadId, "2026-05-05T11:00:00Z")).toBe(0);
    const row = db
      .prepare("SELECT read_at FROM messages WHERE message_sid = ?")
      .get(VALID_SID_1) as { read_at: string | null };
    expect(row.read_at).toBeNull();
  });
});

describe("MessagesRepository.updateMessageStatus", () => {
  it("returns enriched row on update", () => {
    const t = repo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
    });
    repo.insertMessageIfAbsent({
      messageSid: VALID_SID_1,
      threadId: t.threadId,
      direction: "outbound",
      body: "hello",
      datetime: "2026-05-05T10:00:00Z",
      status: "queued",
    });
    const enriched = repo.updateMessageStatus(VALID_SID_1, "delivered");
    expect(enriched).toMatchObject({
      messageSid: VALID_SID_1,
      threadId: t.threadId,
      userGuid,
      status: "delivered",
    });
  });

  it("returns undefined for unknown SID", () => {
    expect(repo.updateMessageStatus(VALID_SID_3, "failed")).toBeUndefined();
  });
});
