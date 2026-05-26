import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "@mobileclient/db";
import type { SseEvent } from "@mobileclient/shared-types";
import { NotFoundError } from "@/lib/errors";
import { ContactService } from "./contact-service";
import { MessagesRepository } from "./messages-repository";
import { SseService } from "./sse-service";
import { UserService } from "./user-service";

let db: Database.Database;
let svc: ContactService;
let messagesRepo: MessagesRepository;
let userGuid: string;
let broadcasts: SseEvent[];

beforeEach(() => {
  db = createTestDb();
  messagesRepo = new MessagesRepository(db);
  const sse = new SseService();
  broadcasts = [];
  const originalBroadcast = sse.broadcast.bind(sse);
  sse.broadcast = vi.fn((event: SseEvent) => {
    broadcasts.push(event);
    originalBroadcast(event);
  });
  svc = new ContactService(db, messagesRepo, sse);
  const users = new UserService(db);
  userGuid = users.createUser({ name: "John", twilioNumber: "+15559990000" });
});

describe("ContactService.createContact", () => {
  it("returns the full Contact with identities", () => {
    const c = svc.createContact(userGuid, {
      firstName: "Emma",
      lastName: "Thompson",
      identities: [{ type: "Phone", value: "+15554443333" }],
    });
    expect(c.firstName).toBe("Emma");
    expect(c.identities).toHaveLength(1);
    expect(c.identities[0]).toEqual({ type: "Phone", value: "+15554443333" });
  });

  it("accepts a caller-supplied guid", () => {
    const c = svc.createContact(userGuid, {
      guid: "contact-custom",
      firstName: "A",
      identities: [{ type: "Phone", value: "+15551111111" }],
    });
    expect(c.contactGuid).toBe("contact-custom");
  });

  it("auto-generates a guid when omitted", () => {
    const c = svc.createContact(userGuid, {
      firstName: "A",
      identities: [{ type: "Phone", value: "+15551111111" }],
    });
    expect(c.contactGuid).toMatch(/^contact-\d+/);
  });

  it("handles null/undefined name/company/photo fields", () => {
    const c = svc.createContact(userGuid, {
      identities: [{ type: "Phone", value: "+15551111111" }],
    });
    expect(c.firstName).toBeUndefined();
    expect(c.lastName).toBeUndefined();
    expect(c.company).toBeUndefined();
  });

  it("back-links unlinked activities with matching digits", () => {
    // Pre-existing activity with no contact but a matching identity value
    db.prepare(
      `INSERT INTO activities (id, user_guid, type, datetime, duration, identity_value, contact_guid)
       VALUES ('a1', ?, 'Message', '2026-05-05T10:00:00Z', 0, '+1 (555) 444-3333', NULL)`,
    ).run(userGuid);
    db.prepare(
      `INSERT INTO activities (id, user_guid, type, datetime, duration, identity_value, contact_guid)
       VALUES ('a2', ?, 'Message', '2026-05-05T10:00:00Z', 0, '+15552221111', NULL)`,
    ).run(userGuid);

    svc.createContact(userGuid, {
      guid: "c1",
      identities: [{ type: "Phone", value: "+15554443333" }],
    });

    const a1 = db.prepare("SELECT contact_guid FROM activities WHERE id='a1'").get() as { contact_guid: string | null };
    const a2 = db.prepare("SELECT contact_guid FROM activities WHERE id='a2'").get() as { contact_guid: string | null };
    expect(a1.contact_guid).toBe("c1");       // digits matched despite formatting
    expect(a2.contact_guid).toBeNull();       // didn't touch unrelated row
  });

  it("back-links unlinked threads too", () => {
    db.prepare(
      `INSERT INTO threads (thread_id, user_guid, remote_address, proxy_address, created, contact_guid)
       VALUES ('thr_t1', ?, '+15554443333', '+15559990000', '2026-05-05T10:00:00Z', NULL)`,
    ).run(userGuid);

    svc.createContact(userGuid, {
      guid: "c1",
      identities: [{ type: "Phone", value: "+1 (555) 444-3333" }],
    });

    const t = db.prepare("SELECT contact_guid FROM threads WHERE thread_id='thr_t1'").get() as { contact_guid: string };
    expect(t.contact_guid).toBe("c1");
  });

  it("does not clobber existing contact linkage on back-link pass", () => {
    db.prepare(
      `INSERT INTO contacts (contact_guid, user_guid, first_name) VALUES ('other', ?, 'Other')`,
    ).run(userGuid);
    db.prepare(
      `INSERT INTO activities (id, user_guid, type, datetime, duration, identity_value, contact_guid)
       VALUES ('a1', ?, 'Message', '2026-05-05T10:00:00Z', 0, '+15554443333', 'other')`,
    ).run(userGuid);

    svc.createContact(userGuid, {
      guid: "c1",
      identities: [{ type: "Phone", value: "+15554443333" }],
    });

    const a1 = db.prepare("SELECT contact_guid FROM activities WHERE id='a1'").get() as { contact_guid: string };
    expect(a1.contact_guid).toBe("other");
  });
});

describe("ContactService.getContact", () => {
  it("returns the contact with identities", () => {
    const created = svc.createContact(userGuid, {
      firstName: "Emma",
      identities: [{ type: "Phone", value: "+15554443333" }],
    });
    const hit = svc.getContact(userGuid, created.contactGuid);
    expect(hit?.firstName).toBe("Emma");
    expect(hit?.identities).toHaveLength(1);
  });

  it("returns undefined for unknown contactGuid", () => {
    expect(svc.getContact(userGuid, "does-not-exist")).toBeUndefined();
  });

  it("does not return another user's contact", () => {
    const other = new UserService(db).createUser({ name: "Other" });
    svc.createContact(other, {
      guid: "cx",
      firstName: "X",
      identities: [{ type: "Phone", value: "+15559999999" }],
    });
    expect(svc.getContact(userGuid, "cx")).toBeUndefined();
  });
});

describe("ContactService.getContacts", () => {
  it("returns all contacts for a user, ordered by first_name then last_name", () => {
    svc.createContact(userGuid, { guid: "b", firstName: "Bob", identities: [{ type: "Phone", value: "+1" }] });
    svc.createContact(userGuid, { guid: "a", firstName: "Alice", identities: [{ type: "Phone", value: "+2" }] });
    const contacts = svc.getContacts(userGuid);
    expect(contacts.map((c) => c.firstName)).toEqual(["Alice", "Bob"]);
  });

  it("returns empty array for user with no contacts", () => {
    expect(svc.getContacts(userGuid)).toEqual([]);
  });
});

describe("ContactService.updateContact", () => {
  it("updates scalar fields", () => {
    const c = svc.createContact(userGuid, {
      guid: "c1",
      firstName: "Old",
      identities: [{ type: "Phone", value: "+15554443333" }],
    });
    svc.updateContact(userGuid, c.contactGuid, { firstName: "New" });
    expect(svc.getContact(userGuid, c.contactGuid)?.firstName).toBe("New");
  });

  it("replaces the identities array when provided", () => {
    const c = svc.createContact(userGuid, {
      guid: "c1",
      identities: [{ type: "Phone", value: "+15554443333" }],
    });
    svc.updateContact(userGuid, c.contactGuid, {
      identities: [
        { type: "Phone", value: "+15550000000" },
        { type: "WhatsApp", value: "+15550000000" },
      ],
    });
    const after = svc.getContact(userGuid, c.contactGuid);
    expect(after?.identities).toHaveLength(2);
    expect(after?.identities.map((i) => i.type)).toEqual(["Phone", "WhatsApp"]);
  });

  it("leaves identities untouched when not provided", () => {
    const c = svc.createContact(userGuid, {
      guid: "c1",
      identities: [{ type: "Phone", value: "+15554443333" }],
    });
    svc.updateContact(userGuid, c.contactGuid, { firstName: "New" });
    expect(svc.getContact(userGuid, c.contactGuid)?.identities).toHaveLength(1);
  });

  it("throws NotFoundError for unknown contact", () => {
    expect(() => svc.updateContact(userGuid, "nope", { firstName: "X" })).toThrow(NotFoundError);
  });
});

describe("ContactService.deleteContact", () => {
  it("returns true when deleted", () => {
    const c = svc.createContact(userGuid, {
      guid: "c1",
      identities: [{ type: "Phone", value: "+15554443333" }],
    });
    expect(svc.deleteContact(userGuid, c.contactGuid)).toBe(true);
  });

  it("returns false for unknown contact", () => {
    expect(svc.deleteContact(userGuid, "nope")).toBe(false);
  });

  it("cascades identity rows via FK", () => {
    svc.createContact(userGuid, {
      guid: "c1",
      identities: [
        { type: "Phone", value: "+1" },
        { type: "WhatsApp", value: "+1" },
      ],
    });
    svc.deleteContact(userGuid, "c1");
    const rows = db.prepare("SELECT * FROM contact_identities WHERE contact_guid='c1'").all();
    expect(rows).toEqual([]);
  });
});

describe("ContactService.addActivity", () => {
  it("inserts an activity row and broadcasts activity.added", () => {
    const enriched = svc.addActivity(userGuid, {
      type: "Phone",
      duration: 5,
      identityValue: "+15554443333",
    });
    expect(enriched.type).toBe("Phone");
    expect(enriched.duration).toBe(5);
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]?.type).toBe("activity.added");
    expect((broadcasts[0] as Extract<SseEvent, { type: "activity.added" }>).payload.type).toBe(
      "Phone",
    );
  });

  it("enriches with contact when contactGuid is provided", () => {
    svc.createContact(userGuid, {
      guid: "c1",
      firstName: "Emma",
      identities: [{ type: "Phone", value: "+15554443333" }],
    });
    const enriched = svc.addActivity(userGuid, {
      type: "Phone",
      duration: 5,
      identityValue: "+15554443333",
      contactGuid: "c1",
    });
    expect(enriched.contact?.firstName).toBe("Emma");
  });

  it("defaults duration to 0 and datetime to now when omitted", () => {
    const a = svc.addActivity(userGuid, { type: "Message" });
    expect(a.duration).toBe(0);
    expect(a.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("honours caller-supplied id (used for webhook retry idempotency)", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    const a = svc.addActivity(userGuid, { id, type: "Message" });
    expect(a.id).toBe(id);
  });
});

describe("ContactService.getActivities", () => {
  it("returns all activities most-recent-first when no filter", () => {
    svc.addActivity(userGuid, { type: "Phone", datetime: "2026-05-04T00:00:00Z" });
    svc.addActivity(userGuid, { type: "Message", datetime: "2026-05-05T00:00:00Z" });
    const out = svc.getActivities(userGuid);
    expect(out.map((a) => a.type)).toEqual(["Message", "Phone"]);
  });

  it("filters by contactGuid", () => {
    svc.createContact(userGuid, {
      guid: "c1",
      identities: [{ type: "Phone", value: "+1" }],
    });
    svc.addActivity(userGuid, { type: "Phone", contactGuid: "c1" });
    svc.addActivity(userGuid, { type: "Phone" }); // no contact
    const out = svc.getActivities(userGuid, { contactGuid: "c1" });
    expect(out).toHaveLength(1);
  });

  it("filters by identityValue (only rows with null contact_guid)", () => {
    svc.createContact(userGuid, {
      guid: "c1",
      identities: [{ type: "Phone", value: "+15554443333" }],
    });
    svc.addActivity(userGuid, { type: "Phone", identityValue: "+15554443333", contactGuid: "c1" });
    svc.addActivity(userGuid, { type: "Phone", identityValue: "+15554443333" }); // unknown
    const out = svc.getActivities(userGuid, { identityValue: "+15554443333" });
    expect(out).toHaveLength(1);
    expect(out[0]?.contactGuid).toBeUndefined();
  });
});

describe("ContactService.getMainList", () => {
  it("merges contacts + unknown identities with unread counts", () => {
    // seed a contact + unknown identity
    svc.createContact(userGuid, {
      guid: "c1",
      firstName: "Emma",
      identities: [{ type: "Phone", value: "+15554443333" }],
    });
    svc.addActivity(userGuid, { type: "Phone", identityValue: "+15554443333", contactGuid: "c1" });
    svc.addActivity(userGuid, { type: "Message", identityValue: "+15552221111" }); // unknown

    // inject unread messages: 2 inbound to Emma, 1 inbound from unknown
    const t1 = messagesRepo.insertThread({
      userGuid,
      remoteAddress: "+15554443333",
      proxyAddress: "+15559990000",
      contactGuid: "c1",
    });
    messagesRepo.insertMessageIfAbsent({
      messageSid: "SM11111111111111111111111111111111",
      threadId: t1.threadId,
      direction: "inbound",
      body: "x",
      datetime: "2026-05-05T10:00:00Z",
    });
    messagesRepo.insertMessageIfAbsent({
      messageSid: "SM22222222222222222222222222222222",
      threadId: t1.threadId,
      direction: "inbound",
      body: "y",
      datetime: "2026-05-05T10:01:00Z",
    });
    const t2 = messagesRepo.insertThread({
      userGuid,
      remoteAddress: "+15552221111",
      proxyAddress: "+15559990000",
    });
    messagesRepo.insertMessageIfAbsent({
      messageSid: "SM33333333333333333333333333333333",
      threadId: t2.threadId,
      direction: "inbound",
      body: "z",
      datetime: "2026-05-05T10:02:00Z",
    });

    const rows = svc.getMainList(userGuid);
    expect(rows).toHaveLength(2);

    const emma = rows.find((r) => r.kind === "contact" && r.guid === "c1");
    expect(emma?.unreadCount).toBe(2);

    const unknown = rows.find((r) => r.kind === "unknown");
    expect(unknown?.identityValue).toBe("+15552221111");
    expect(unknown?.unreadCount).toBe(1);
  });

  it("returns contacts with no activity (lastInteractedAt undefined)", () => {
    svc.createContact(userGuid, {
      guid: "c1",
      firstName: "Emma",
      identities: [{ type: "Phone", value: "+1" }],
    });
    const rows = svc.getMainList(userGuid);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastInteractedAt).toBeUndefined();
    expect(rows[0]?.unreadCount).toBe(0);
  });

  it("returns empty array for user with no contacts or unknowns", () => {
    expect(svc.getMainList(userGuid)).toEqual([]);
  });
});
