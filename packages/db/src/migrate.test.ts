import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "./migrate";

describe("migrate", () => {
  it("creates all expected tables on a fresh DB", () => {
    const db = new Database(":memory:");
    migrate(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: unknown) => (r as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "activities",
        "contact_identities",
        "contacts",
        "messages",
        "otp_verifications",
        "threads",
        "transcriptions",
        "users",
      ]),
    );
  });

  it("is idempotent — running twice is fine", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
  });

  it("turns on foreign keys", () => {
    const db = new Database(":memory:");
    migrate(db);
    const fk = db.pragma("foreign_keys", { simple: true });
    expect(fk).toBe(1);
  });
});
