import type Database from "better-sqlite3";
import { SCHEMA } from "./schema";

export function migrate(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
}
