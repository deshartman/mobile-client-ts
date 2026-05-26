import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "@mobileclient/db";
import type { SseEvent } from "@mobileclient/shared-types";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { ContactService } from "./contact-service";
import { MessagesRepository } from "./messages-repository";
import { MessagingService } from "./messaging-service";
import { SseService } from "./sse-service";
import { UserService } from "./user-service";

const messagesCreateMock = vi.fn();
vi.mock("@/lib/twilio-client", () => ({
  getTwilioClient: () => ({
    messages: { create: messagesCreateMock },
  }),
}));

let db: Database.Database;
let users: UserService;
let contacts: ContactService;
let messagesRepo: MessagesRepository;
let sse: SseService;
let svc: MessagingService;
let userGuid: string;
let broadcasts: SseEvent[];

beforeEach(() => {
  db = createTestDb();
  users = new UserService(db);
  messagesRepo = new MessagesRepository(db);
  sse = new SseService();
  broadcasts = [];
  sse.broadcast = vi.fn((event: SseEvent) => {
    broadcasts.push(event);
  });
  contacts = new ContactService(db, messagesRepo, sse);
  svc = new MessagingService(contacts, users, messagesRepo, sse);
  userGuid = users.createUser({ name: "John", twilioNumber: "+15559990000" });

  messagesCreateMock.mockReset();
  messagesCreateMock.mockResolvedValue({
    sid: "SM11111111111111111111111111111111",
    status: "queued",
    dateCreated: new Date("2026-05-05T10:00:00Z"),
  });
});

describe("MessagingService.resolveContactGuid", () => {
  it("matches via digits normalisation", () => {
    contacts.createContact(userGuid, {
      guid: "c1",
      identities: [{ type: "Phone", value: "+1 (555) 444-3333" }],
    });
    expect(svc.resolveContactGuid(userGuid, "+15554443333")).toBe("c1");
  });

  it("returns undefined for empty input", () => {
    expect(svc.resolveContactGuid(userGuid, "")).toBeUndefined();
  });

  it("returns undefined when no contact matches", () => {
    expect(svc.resolveContactGuid(userGuid, "+15559999999")).toBeUndefined();
  });
});

describe("MessagingService.ensureThread", () => {
  it("throws NotFoundError when user is unknown", () => {
    expect(() =>
      svc.ensureThread({
        userGuid: "00000000-0000-4000-8000-000000000000",
        remoteAddress: "+15554443333",
      }),
    ).toThrow(NotFoundError);
  });

  it("throws ValidationError when user has no twilio_number", () => {
    const guid = users.createUser({ name: "NoNumber" });
    expect(() =>
      svc.ensureThread({ userGuid: guid, remoteAddress: "+15554443333" }),
    ).toThrow(ValidationError);
  });

  it("creates a new thread and resolves contactGuid via identities", () => {
    contacts.createContact(userGuid, {
      guid: "c1",
      identities: [{ type: "Phone", value: "+15554443333" }],
    });
    const t = svc.ensureThread({ userGuid, remoteAddress: "+15554443333" });
    expect(t.contactGuid).toBe("c1");
  });

  it("returns the existing thread when called twice (idempotent)", () => {
    const t1 = svc.ensureThread({ userGuid, remoteAddress: "+15554443333" });
    const t2 = svc.ensureThread({ userGuid, remoteAddress: "+15554443333" });
    expect(t2.threadId).toBe(t1.threadId);
  });
});

describe("MessagingService.sendMessage", () => {
  it("rejects missing fields", async () => {
    await expect(
      svc.sendMessage({ userGuid, remoteAddress: "", body: "x" }),
    ).rejects.toThrow(ValidationError);
    await expect(svc.sendMessage({ userGuid, remoteAddress: "+1", body: "" })).rejects.toThrow(
      ValidationError,
    );
  });

  it("normalises remoteAddress to E.164 with only + and digits", async () => {
    await svc.sendMessage({ userGuid, remoteAddress: "+1 (555) 444-3333", body: "hi" });
    const call = messagesCreateMock.mock.calls[0]?.[0];
    expect(call.to).toBe("+15554443333");
    expect(call.from).toBe("+15559990000");
    expect(call.body).toBe("hi");
  });

  it("persists the message row and broadcasts message.added", async () => {
    await svc.sendMessage({ userGuid, remoteAddress: "+15554443333", body: "hi" });
    const thread = messagesRepo.findThreadByPair(userGuid, "+15559990000", "+15554443333");
    expect(thread).toBeDefined();
    expect(messagesRepo.getMessages(thread!.threadId)).toHaveLength(1);
    expect(broadcasts.filter((b) => b.type === "message.added")).toHaveLength(1);
  });

  it("on first message: adds a Message activity + broadcasts activity.added + sets thread.activityId", async () => {
    const result = await svc.sendMessage({
      userGuid,
      remoteAddress: "+15554443333",
      body: "hi",
    });
    expect(broadcasts.filter((b) => b.type === "activity.added")).toHaveLength(1);
    const thread = messagesRepo.findThreadById(result.threadId);
    expect(thread?.activityId).toBeDefined();
  });

  it("on second message to same thread: NO duplicate activity", async () => {
    await svc.sendMessage({ userGuid, remoteAddress: "+15554443333", body: "first" });
    messagesCreateMock.mockResolvedValueOnce({
      sid: "SM22222222222222222222222222222222",
      status: "queued",
    });
    broadcasts.length = 0;
    await svc.sendMessage({ userGuid, remoteAddress: "+15554443333", body: "second" });
    expect(broadcasts.filter((b) => b.type === "activity.added")).toHaveLength(0);
    expect(broadcasts.filter((b) => b.type === "message.added")).toHaveLength(1);
  });

  it("returns { threadId, messageSid, status }", async () => {
    const result = await svc.sendMessage({
      userGuid,
      remoteAddress: "+15554443333",
      body: "hi",
    });
    expect(result.messageSid).toBe("SM11111111111111111111111111111111");
    expect(result.status).toBe("queued");
    expect(result.threadId).toMatch(/^thr_/);
  });

  it("defaults status to 'queued' when Twilio returns no status", async () => {
    messagesCreateMock.mockResolvedValueOnce({ sid: "SM11111111111111111111111111111111" });
    const result = await svc.sendMessage({
      userGuid,
      remoteAddress: "+15554443333",
      body: "hi",
    });
    expect(result.status).toBe("queued");
  });
});

describe("MessagingService.getThread", () => {
  it("returns empty messages and undefined threadId for unknown thread", () => {
    const out = svc.getThread(userGuid, "+15559999999");
    expect(out).toEqual({ messages: [] });
  });

  it("returns empty messages when userGuid is missing", () => {
    const out = svc.getThread("", "+15551111111");
    expect(out).toEqual({ messages: [] });
  });

  it("returns messages ordered by datetime", async () => {
    await svc.sendMessage({ userGuid, remoteAddress: "+15554443333", body: "first" });
    messagesCreateMock.mockResolvedValueOnce({
      sid: "SM22222222222222222222222222222222",
      status: "queued",
    });
    await svc.sendMessage({ userGuid, remoteAddress: "+15554443333", body: "second" });
    const out = svc.getThread(userGuid, "+15554443333");
    expect(out.messages.map((m) => m.body)).toEqual(["first", "second"]);
  });
});
