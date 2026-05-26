import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

const USERS = [
  {
    user_guid: "6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d",
    name: "John Doe",
    email: "john.doe@example.com",
    created: "2021-09-01T00:00:00Z",
  },
  {
    user_guid: "6fdf6ffc-ed77-94fa-407e-a7b86ed9exxx",
    name: "Jane Smith",
    email: "jane.smith@example.com",
    created: "2021-09-01T00:00:00Z",
  },
] as const;

const CONTACTS = [
  { guid: "contact-1", user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d", firstName: "Emma", lastName: "Thompson", company: "Tech Corp",
    identities: [{ type: "Phone", value: "+1 (555) 444-3333" }, { type: "WhatsApp", value: "+1 (555) 444-3333" }] },
  { guid: "contact-2", user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d", firstName: "Michael", lastName: "Chen", company: "Innovation Labs",
    identities: [{ type: "Phone", value: "+1 (555) 555-5555" }, { type: "Message", value: "+1 (555) 555-5555" }] },
  { guid: "contact-3", user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d", firstName: "John", lastName: "Smith", company: "Acme Corp",
    identities: [{ type: "Phone", value: "+1 (555) 666-6666" }, { type: "Message", value: "+1 (555) 666-6666" }, { type: "WhatsApp", value: "+1 (555) 666-6666" }] },
  { guid: "contact-4", user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d", firstName: "Sarah", lastName: "Johnson", company: "Global Solutions",
    identities: [{ type: "Phone", value: "+1 (555) 777-7777" }, { type: "WhatsApp", value: "+1 (555) 777-7777" }] },
  { guid: "contact-5", user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9exxx", firstName: "David", lastName: "Wilson", company: "Startup Inc",
    identities: [{ type: "Phone", value: "+1 (555) 888-8888" }, { type: "Message", value: "+1 (555) 888-8888" }] },
  { guid: "contact-6", user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9exxx", firstName: "Lisa", lastName: "Brown", company: "Creative Design",
    identities: [{ type: "Phone", value: "+1 (555) 999-9999" }, { type: "WhatsApp", value: "+1 (555) 999-9999" }] },
] as const;

const ACTIVITIES = [
  { user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d", type: "Phone",    datetime: "2025-02-23T01:15:00", duration: 45, identityValue: "+1 (555) 444-3333", contactGuid: "contact-1" },
  { user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d", type: "Message",  datetime: "2025-02-22T10:30:00", duration: 15, identityValue: "+1 (555) 555-5555", contactGuid: "contact-2" },
  { user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d", type: "WhatsApp", datetime: "2025-02-22T09:15:00", duration: 30, identityValue: "+1 (555) 666-6666", contactGuid: "contact-3" },
  { user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d", type: "Phone",    datetime: "2025-02-22T08:45:00", duration: 25, identityValue: "+1 (555) 777-7777", contactGuid: "contact-4" },
  { user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d", type: "WhatsApp", datetime: "2025-02-21T14:20:00", duration: 18, identityValue: "+1 (555) 444-3333", contactGuid: "contact-1" },
  { user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9e59d", type: "Phone",    datetime: "2025-02-21T11:05:00", duration: 32, identityValue: "+1 (555) 666-6666", contactGuid: "contact-3" },
  { user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9exxx", type: "Phone",    datetime: "2025-02-23T02:30:00", duration: 28, identityValue: "+1 (555) 888-8888", contactGuid: "contact-5" },
  { user: "6fdf6ffc-ed77-94fa-407e-a7b86ed9exxx", type: "WhatsApp", datetime: "2025-02-22T15:45:00", duration: 22, identityValue: "+1 (555) 999-9999", contactGuid: "contact-6" },
] as const;

export interface SeedResult {
  seeded: boolean;
  users: number;
  contacts: number;
  activities: number;
}

export function seed(db: Database.Database): SeedResult {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  if (existing.count > 0) {
    return { seeded: false, users: existing.count, contacts: 0, activities: 0 };
  }

  const insertUser = db.prepare(
    "INSERT INTO users (user_guid, name, email, active, created) VALUES (?, ?, ?, 1, ?)",
  );
  const insertContact = db.prepare(
    "INSERT INTO contacts (contact_guid, user_guid, first_name, last_name, company) VALUES (?, ?, ?, ?, ?)",
  );
  const insertIdentity = db.prepare(
    "INSERT INTO contact_identities (contact_guid, type, value) VALUES (?, ?, ?)",
  );
  const insertActivity = db.prepare(
    "INSERT INTO activities (id, user_guid, type, datetime, duration, identity_value, contact_guid) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  const tx = db.transaction(() => {
    for (const u of USERS) insertUser.run(u.user_guid, u.name, u.email, u.created);
    for (const c of CONTACTS) {
      insertContact.run(c.guid, c.user, c.firstName, c.lastName, c.company);
      for (const i of c.identities) insertIdentity.run(c.guid, i.type, i.value);
    }
    for (const a of ACTIVITIES) {
      insertActivity.run(uuidv4(), a.user, a.type, a.datetime, a.duration, a.identityValue, a.contactGuid);
    }
  });
  tx();

  return {
    seeded: true,
    users: USERS.length,
    contacts: CONTACTS.length,
    activities: ACTIVITIES.length,
  };
}
