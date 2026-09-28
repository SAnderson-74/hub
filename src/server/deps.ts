import type { Config } from "./config";
import type { Db, Sqlite } from "./db/client";

/** Everything route factories need. Tests build this with an in-memory database. */
export type Deps = {
  config: Config;
  db: Db;
  sqlite: Sqlite;
  startedAt: Date;
  /** Stops the server so its container starts it again, like after a restore. */
  restart: () => void;
};
