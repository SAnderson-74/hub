import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type Sqlite = Database.Database;

/** Opens (or creates) the database file. Pass ":memory:" in tests. */
export function openDatabase(file: string) {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle({ client: sqlite, schema });
  return { sqlite, db };
}

export type Db = ReturnType<typeof openDatabase>["db"];
