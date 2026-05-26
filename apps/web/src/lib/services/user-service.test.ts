import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "@mobileclient/db";
import { NotFoundError } from "@/lib/errors";
import { UserService } from "./user-service";

let db: Database.Database;
let svc: UserService;

beforeEach(() => {
  db = createTestDb();
  svc = new UserService(db);
});

describe("UserService.createUser", () => {
  it("creates a user and returns a uuid", () => {
    const guid = svc.createUser({ name: "John" });
    expect(guid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("defaults active=true when active is omitted", () => {
    const guid = svc.createUser({ name: "John" });
    const user = svc.getUser(guid);
    expect(user?.active).toBe(true);
  });

  it("honours active=false", () => {
    const guid = svc.createUser({ name: "Inactive", active: false });
    expect(svc.getUser(guid)?.active).toBe(false);
  });

  it("persists phone, email, twilioNumber, twilioNumberSid", () => {
    const guid = svc.createUser({
      name: "John",
      phone: "+15551111111",
      email: "j@example.com",
      twilioNumber: "+15559990000",
      twilioNumberSid: "PN00000000000000000000000000000001",
    });
    const u = svc.getUser(guid);
    expect(u).toMatchObject({
      name: "John",
      phone: "+15551111111",
      email: "j@example.com",
      twilioNumber: "+15559990000",
      twilioNumberSid: "PN00000000000000000000000000000001",
    });
  });

  it("stores the created timestamp we provide (or now if omitted)", () => {
    const guid = svc.createUser({ name: "A", created: "2020-01-01T00:00:00Z" });
    expect(svc.getUser(guid)?.created).toBe("2020-01-01T00:00:00Z");
  });
});

describe("UserService.getUser", () => {
  it("returns undefined for unknown guids", () => {
    expect(svc.getUser("not-a-guid-at-all")).toBeUndefined();
  });
});

describe("UserService.getUserByPhone", () => {
  it("returns the matching user", () => {
    const guid = svc.createUser({ name: "John", phone: "+15551111111" });
    const hit = svc.getUserByPhone("+15551111111");
    expect(hit?.userGuid).toBe(guid);
    expect(hit?.user.name).toBe("John");
  });

  it("returns undefined for unknown phone", () => {
    expect(svc.getUserByPhone("+15559999999")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(svc.getUserByPhone("")).toBeUndefined();
  });
});

describe("UserService.getUserByEmail", () => {
  it("returns the matching user", () => {
    const guid = svc.createUser({ name: "J", email: "j@x.com" });
    expect(svc.getUserByEmail("j@x.com")?.userGuid).toBe(guid);
  });

  it("returns undefined for empty string", () => {
    expect(svc.getUserByEmail("")).toBeUndefined();
  });
});

describe("UserService.getUserByTwilioNumber", () => {
  it("returns the matching user", () => {
    const guid = svc.createUser({ name: "J", twilioNumber: "+15559990000" });
    expect(svc.getUserByTwilioNumber("+15559990000")?.userGuid).toBe(guid);
  });

  it("returns undefined for empty string", () => {
    expect(svc.getUserByTwilioNumber("")).toBeUndefined();
  });
});

describe("UserService.updateUser", () => {
  it("applies a partial patch", () => {
    const guid = svc.createUser({ name: "Old" });
    const updated = svc.updateUser(guid, { name: "New" });
    expect(updated.name).toBe("New");
  });

  it("treats explicit null as clearing the field", () => {
    const guid = svc.createUser({ name: "J", phone: "+15551111111" });
    svc.updateUser(guid, { phone: null });
    expect(svc.getUser(guid)?.phone).toBeUndefined();
  });

  it("preserves unchanged fields", () => {
    const guid = svc.createUser({ name: "J", email: "j@x.com" });
    svc.updateUser(guid, { name: "Jane" });
    expect(svc.getUser(guid)?.email).toBe("j@x.com");
  });

  it("toggles active", () => {
    const guid = svc.createUser({ name: "J" });
    svc.updateUser(guid, { active: false });
    expect(svc.getUser(guid)?.active).toBe(false);
  });

  it("throws NotFoundError for unknown guid", () => {
    expect(() => svc.updateUser("00000000-0000-4000-8000-000000000000", { name: "X" })).toThrow(
      NotFoundError,
    );
  });
});

describe("UserService.deleteUser", () => {
  it("removes the row", () => {
    const guid = svc.createUser({ name: "J" });
    svc.deleteUser(guid);
    expect(svc.getUser(guid)).toBeUndefined();
  });

  it("is a no-op for unknown guid", () => {
    expect(() => svc.deleteUser("00000000-0000-4000-8000-000000000000")).not.toThrow();
  });
});
