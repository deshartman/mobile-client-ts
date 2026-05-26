import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { rowToCamel } from "@mobileclient/db";
import {
  ActivitySchema,
  ContactSchema,
  type Activity,
  type ActivityKind,
  type Contact,
  type ContactIdentity,
  type MainListRow,
} from "@mobileclient/shared-types";
import { NotFoundError } from "../errors";
import type { MessagesRepository } from "./messages-repository";
import type { SseService } from "./sse-service";

export interface CreateContactInput {
  guid?: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  photoData?: string | null;
  identities?: ContactIdentity[];
}

export interface UpdateContactInput {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  photoData?: string | null;
  identities?: ContactIdentity[];
}

export interface AddActivityInput {
  id?: string;
  type: ActivityKind;
  datetime?: string;
  duration?: number;
  identityValue?: string | null;
  contactGuid?: string | null;
  callSid?: string | null;
}

export type ActivityFilter = { contactGuid: string } | { identityValue: string };

export interface EnrichedActivity extends Activity {
  contact?: Contact;
}

function toDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export class ContactService {
  private readonly selectContactsForUserStmt;
  private readonly selectContactStmt;
  private readonly selectIdentitiesStmt;
  private readonly insertContactStmt;
  private readonly deleteContactStmt;
  private readonly insertIdentityStmt;
  private readonly deleteIdentitiesStmt;
  private readonly updateContactFieldsStmt;
  private readonly selectActivitiesForUserStmt;
  private readonly selectActivitiesForUserAndContactStmt;
  private readonly selectActivitiesForUserAndIdentityStmt;
  private readonly insertActivityStmt;
  private readonly selectUnlinkedActivitiesStmt;
  private readonly linkActivityToContactStmt;
  private readonly selectUnlinkedThreadsStmt;
  private readonly linkThreadToContactStmt;
  private readonly selectMainListStmt;

  constructor(
    private readonly db: Database.Database,
    private readonly messagesRepo: MessagesRepository,
    private readonly sseService: SseService,
  ) {
    this.selectContactsForUserStmt = db.prepare(
      "SELECT * FROM contacts WHERE user_guid = ? ORDER BY first_name, last_name",
    );
    this.selectContactStmt = db.prepare(
      "SELECT * FROM contacts WHERE user_guid = ? AND contact_guid = ?",
    );
    this.selectIdentitiesStmt = db.prepare(
      "SELECT type, value FROM contact_identities WHERE contact_guid = ? ORDER BY id",
    );
    this.insertContactStmt = db.prepare(
      `INSERT INTO contacts
          (contact_guid, user_guid, first_name, last_name, company, photo_data)
        VALUES (?, ?, ?, ?, ?, ?)`,
    );
    this.deleteContactStmt = db.prepare(
      "DELETE FROM contacts WHERE user_guid = ? AND contact_guid = ?",
    );
    this.insertIdentityStmt = db.prepare(
      "INSERT INTO contact_identities (contact_guid, type, value) VALUES (?, ?, ?)",
    );
    this.deleteIdentitiesStmt = db.prepare(
      "DELETE FROM contact_identities WHERE contact_guid = ?",
    );
    this.updateContactFieldsStmt = db.prepare(
      `UPDATE contacts
         SET first_name = ?, last_name = ?, company = ?, photo_data = ?
       WHERE user_guid = ? AND contact_guid = ?`,
    );

    this.selectActivitiesForUserStmt = db.prepare(
      "SELECT * FROM activities WHERE user_guid = ? ORDER BY datetime DESC",
    );
    this.selectActivitiesForUserAndContactStmt = db.prepare(
      "SELECT * FROM activities WHERE user_guid = ? AND contact_guid = ? ORDER BY datetime DESC",
    );
    this.selectActivitiesForUserAndIdentityStmt = db.prepare(
      "SELECT * FROM activities WHERE user_guid = ? AND contact_guid IS NULL AND identity_value = ? ORDER BY datetime DESC",
    );
    this.insertActivityStmt = db.prepare(
      `INSERT INTO activities
          (id, user_guid, type, datetime, duration, identity_value, contact_guid, call_sid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    this.selectUnlinkedActivitiesStmt = db.prepare(
      "SELECT id, identity_value FROM activities WHERE user_guid = ? AND contact_guid IS NULL AND identity_value IS NOT NULL",
    );
    this.linkActivityToContactStmt = db.prepare(
      "UPDATE activities SET contact_guid = ? WHERE id = ? AND contact_guid IS NULL",
    );
    this.selectUnlinkedThreadsStmt = db.prepare(
      "SELECT thread_id, remote_address FROM threads WHERE user_guid = ? AND contact_guid IS NULL",
    );
    this.linkThreadToContactStmt = db.prepare(
      "UPDATE threads SET contact_guid = ? WHERE thread_id = ? AND contact_guid IS NULL",
    );

    this.selectMainListStmt = db.prepare(`
      SELECT 'contact' AS kind,
             c.contact_guid AS guid,
             c.first_name, c.last_name, c.company, c.photo_data,
             NULL AS identity_value,
             la.last_interacted_at
        FROM contacts c
        LEFT JOIN (
          SELECT contact_guid, MAX(datetime) AS last_interacted_at
            FROM activities
           WHERE user_guid = ? AND contact_guid IS NOT NULL
           GROUP BY contact_guid
        ) la ON la.contact_guid = c.contact_guid
       WHERE c.user_guid = ?

      UNION ALL

      SELECT 'unknown' AS kind,
             NULL, NULL, NULL, NULL, NULL,
             identity_value,
             MAX(datetime) AS last_interacted_at
        FROM activities
       WHERE user_guid = ? AND contact_guid IS NULL AND identity_value IS NOT NULL
       GROUP BY identity_value

      ORDER BY last_interacted_at DESC NULLS LAST,
               first_name COLLATE NOCASE,
               last_name  COLLATE NOCASE
    `);
  }

  private identitiesFor(contactGuid: string): ContactIdentity[] {
    const rows = this.selectIdentitiesStmt.all(contactGuid) as Array<{
      type: ContactIdentity["type"];
      value: string;
    }>;
    return rows.map((r) => ({ type: r.type, value: r.value }));
  }

  private contactFor(userGuid: string, contactGuid: string): Contact | undefined {
    const row = this.selectContactStmt.get(userGuid, contactGuid) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return ContactSchema.parse({
      ...rowToCamel(row),
      identities: this.identitiesFor(contactGuid),
    });
  }

  getContacts(userGuid: string): Contact[] {
    const rows = this.selectContactsForUserStmt.all(userGuid) as Record<string, unknown>[];
    return rows.map((row) =>
      ContactSchema.parse({
        ...rowToCamel(row),
        identities: this.identitiesFor(row.contact_guid as string),
      }),
    );
  }

  getContact(userGuid: string, contactGuid: string): Contact | undefined {
    return this.contactFor(userGuid, contactGuid);
  }

  getMainList(userGuid: string): MainListRow[] {
    const rows = this.selectMainListStmt.all(userGuid, userGuid, userGuid) as Array<{
      kind: "contact" | "unknown";
      guid: string | null;
      first_name: string | null;
      last_name: string | null;
      company: string | null;
      photo_data: string | null;
      identity_value: string | null;
      last_interacted_at: string | null;
    }>;

    const unreadByContact = new Map<string, number>();
    const unreadByDigits = new Map<string, number>();
    const unreadRows = this.messagesRepo.unreadCountsByThreadForUser(userGuid);
    for (const u of unreadRows) {
      if (u.contactGuid) {
        unreadByContact.set(u.contactGuid, (unreadByContact.get(u.contactGuid) ?? 0) + u.unreadCount);
      }
      const digits = toDigits(u.remoteAddress);
      if (digits) {
        unreadByDigits.set(digits, (unreadByDigits.get(digits) ?? 0) + u.unreadCount);
      }
    }

    return rows.map((r): MainListRow => {
      if (r.kind === "contact" && r.guid) {
        return {
          kind: "contact",
          guid: r.guid,
          firstName: r.first_name ?? undefined,
          lastName: r.last_name ?? undefined,
          company: r.company ?? undefined,
          photoData: r.photo_data ?? undefined,
          identities: this.identitiesFor(r.guid),
          lastInteractedAt: r.last_interacted_at ?? undefined,
          unreadCount: unreadByContact.get(r.guid) ?? 0,
        };
      }
      return {
        kind: "unknown",
        identities: [],
        identityValue: r.identity_value ?? "",
        lastInteractedAt: r.last_interacted_at ?? undefined,
        unreadCount: unreadByDigits.get(toDigits(r.identity_value)) ?? 0,
      };
    });
  }

  createContact(userGuid: string, input: CreateContactInput): Contact {
    const guid = input.guid ?? `contact-${Date.now()}`;
    const identities = input.identities ?? [];

    const tx = this.db.transaction(() => {
      this.insertContactStmt.run(
        guid,
        userGuid,
        input.firstName ?? null,
        input.lastName ?? null,
        input.company ?? null,
        input.photoData ?? null,
      );
      for (const i of identities) this.insertIdentityStmt.run(guid, i.type, i.value);
      this.backlinkUnlinked(userGuid, guid, identities);
    });
    tx();

    const created = this.contactFor(userGuid, guid);
    if (!created) throw new Error(`createContact: newly-created contact not found: ${guid}`);
    return created;
  }

  updateContact(userGuid: string, contactGuid: string, patch: UpdateContactInput): string {
    const existing = this.selectContactStmt.get(userGuid, contactGuid) as
      | Record<string, unknown>
      | undefined;
    if (!existing) throw new NotFoundError(`Contact not found: ${contactGuid}`);

    const identities = patch.identities ?? null;

    const tx = this.db.transaction(() => {
      this.updateContactFieldsStmt.run(
        patch.firstName ?? (existing.first_name as string | null),
        patch.lastName ?? (existing.last_name as string | null),
        patch.company ?? (existing.company as string | null),
        patch.photoData !== undefined ? patch.photoData : (existing.photo_data as string | null),
        userGuid,
        contactGuid,
      );
      if (identities !== null) {
        this.deleteIdentitiesStmt.run(contactGuid);
        for (const i of identities) this.insertIdentityStmt.run(contactGuid, i.type, i.value);
        this.backlinkUnlinked(userGuid, contactGuid, identities);
      }
    });
    tx();

    return contactGuid;
  }

  deleteContact(userGuid: string, contactGuid: string): boolean {
    const result = this.deleteContactStmt.run(userGuid, contactGuid);
    return result.changes > 0;
  }

  getActivities(userGuid: string, filter?: ActivityFilter): EnrichedActivity[] {
    let rows: Record<string, unknown>[];
    if (filter && "contactGuid" in filter) {
      rows = this.selectActivitiesForUserAndContactStmt.all(userGuid, filter.contactGuid) as Record<string, unknown>[];
    } else if (filter && "identityValue" in filter) {
      rows = this.selectActivitiesForUserAndIdentityStmt.all(userGuid, filter.identityValue) as Record<string, unknown>[];
    } else {
      rows = this.selectActivitiesForUserStmt.all(userGuid) as Record<string, unknown>[];
    }

    return rows.map((row) => {
      const activity = ActivitySchema.parse(rowToCamel({ ...row, user_guid: userGuid }));
      const contact = activity.contactGuid ? this.contactFor(userGuid, activity.contactGuid) : undefined;
      return contact ? { ...activity, contact } : activity;
    });
  }

  addActivity(userGuid: string, input: AddActivityInput): EnrichedActivity {
    const id = input.id ?? uuidv4();
    const datetime = input.datetime ?? new Date().toISOString();
    const duration = input.duration ?? 0;
    const contactGuid = input.contactGuid ?? null;
    const callSid = input.callSid ?? null;
    const identityValue = input.identityValue ?? null;

    this.insertActivityStmt.run(
      id,
      userGuid,
      input.type,
      datetime,
      duration,
      identityValue,
      contactGuid,
      callSid,
    );

    const stored = ActivitySchema.parse({
      id,
      userGuid,
      type: input.type,
      datetime,
      duration,
      identityValue,
      contactGuid,
      callSid,
    });
    const contact = contactGuid ? this.contactFor(userGuid, contactGuid) : undefined;
    const enriched: EnrichedActivity = contact ? { ...stored, contact } : stored;

    this.sseService.broadcast({
      type: "activity.added",
      userGuid,
      payload: stored,
    });

    return enriched;
  }

  private backlinkUnlinked(
    userGuid: string,
    contactGuid: string,
    identities: ContactIdentity[],
  ): void {
    const targetDigits = new Set(
      identities
        .map((i) => toDigits(i.value))
        .filter((d) => d.length > 0),
    );
    if (targetDigits.size === 0) return;

    const activities = this.selectUnlinkedActivitiesStmt.all(userGuid) as Array<{
      id: string;
      identity_value: string | null;
    }>;
    for (const a of activities) {
      if (targetDigits.has(toDigits(a.identity_value))) {
        this.linkActivityToContactStmt.run(contactGuid, a.id);
      }
    }

    const threads = this.selectUnlinkedThreadsStmt.all(userGuid) as Array<{
      thread_id: string;
      remote_address: string;
    }>;
    for (const t of threads) {
      if (targetDigits.has(toDigits(t.remote_address))) {
        this.linkThreadToContactStmt.run(contactGuid, t.thread_id);
      }
    }
  }
}
