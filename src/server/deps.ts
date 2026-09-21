import type { Config } from "./config";
import type { Db, Sqlite } from "./db/client";

/** Everything route factories need. Tests build this with an in-memory database. */
export type Deps = {
  config: Config;
  db: Db;
  sqlite: Sqlite;
  startedAt: Date;
};
