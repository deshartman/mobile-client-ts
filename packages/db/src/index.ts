import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { migrate } from "./migrate";

const globalForDb = globalThis as unknown as {
  __mobileClientDb?: Database.Database;
};

export interface GetDbOptions {
  path?: string;
  memory?: boolean;
}

export function getDb(opts: GetDbOptions = {}): Database.Database {
  if (globalForDb.__mobileClientDb) return globalForDb.__mobileClientDb;

  const path = opts.memory ? ":memory:" : opts.path ?? process.env.DB_PATH ?? "./data/app.db";

  // Ensure the parent directory exists for file-backed DBs. better-sqlite3
  // won't create it for us and throws "Cannot open database because the
  // directory does not exist" on the first boot of a fresh checkout.
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path);
  migrate(db);
  globalForDb.__mobileClientDb = db;
  return db;
}

export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

export { migrate } from "./migrate";
export { SCHEMA } from "./schema";
export { rowToCamel, rowsToCamel, snakeToCamel } from "./case";
