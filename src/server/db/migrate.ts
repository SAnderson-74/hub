import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { backupTo, preMigrateBackupName } from "./backup";
import type { Db, Sqlite } from "./client";

const MIGRATIONS_TABLE = "__drizzle_migrations";

/** Number of migration files not yet applied. Mirrors Drizzle's own bookkeeping. */
export function pendingMigrationCount(sqlite: Sqlite, migrationsDir: string): number {
  const files = readMigrationFiles({ migrationsFolder: migrationsDir });
  const table = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(MIGRATIONS_TABLE);
  if (!table) return files.length;
  const last = sqlite
    .prepare(
      `SELECT created_at AS createdAt FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as { createdAt: number | string } | undefined;
  if (!last) return files.length;
  const lastApplied = Number(last.createdAt);
  return files.filter((file) => file.folderMillis > lastApplied).length;
}

function hasUserTables(sqlite: Sqlite): boolean {
  const row = sqlite
    .prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != ?",
    )
    .get(MIGRATIONS_TABLE) as { n: number };
  return row.n > 0;
}

type MigrateOptions = { sqlite: Sqlite; db: Db; migrationsDir: string; backupDir: string };

/**
 * Applies pending migrations. If the database already holds data, it is copied to
 * backups/pre-migrate-<timestamp>.sqlite3 first, so a bad migration can be undone.
 */
export async function migrateWithBackup(options: MigrateOptions) {
  const { sqlite, db, migrationsDir, backupDir } = options;
  const pending = pendingMigrationCount(sqlite, migrationsDir);
  if (pending === 0) return { applied: 0, backup: null as string | null };
  const backup = hasUserTables(sqlite)
    ? await backupTo(sqlite, backupDir, preMigrateBackupName())
    : null;
  migrate(db, { migrationsFolder: migrationsDir });
  return { applied: pending, backup };
}
