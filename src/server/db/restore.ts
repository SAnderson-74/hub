import { closeSync, existsSync, openSync, readSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { log } from "../log";

// Restoring a backup. The live database can't be swapped while Hub has it open, so a
// restore is staged next to it and Hub restarts; at startup, before the database is
// opened, the staged copy takes its place. Migrations then bring it up to date, as
// they would any older database.

/** The staged backup, waiting for the next start. */
export const PENDING_RESTORE = "restore-pending.sqlite3";

/** Tables every Hub database has since the first release. */
const REQUIRED_TABLES = ["__drizzle_migrations", "settings", "tasks"];

export type BackupCheck = { ok: true; migrations: number } | { ok: false; reason: string };

const NOT_A_BACKUP = "That file isn't a Hub backup. Pick a .sqlite3 file from Hub's backups.";

/**
 * Whether a file is a readable Hub database: an SQLite file that passes SQLite's own
 * quick check and has Hub's tables. Opens it read-write, so check a copy, never the
 * original.
 */
export function checkBackupFile(path: string): BackupCheck {
  const header = Buffer.alloc(16);
  try {
    const fd = openSync(path, "r");
    try {
      readSync(fd, header, 0, 16, 0);
    } finally {
      closeSync(fd);
    }
  } catch {
    return { ok: false, reason: NOT_A_BACKUP };
  }
  if (header.toString("latin1") !== "SQLite format 3\0") return { ok: false, reason: NOT_A_BACKUP };

  let sqlite: Database.Database | null = null;
  try {
    sqlite = new Database(path, { fileMustExist: true });
    const quick = sqlite.pragma("quick_check", { simple: true });
    if (quick !== "ok") {
      return {
        ok: false,
        reason: "That backup is damaged, so it can't be restored. Try an older one.",
      };
    }
    const tables = new Set(
      (
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
          name: string;
        }>
      ).map((row) => row.name),
    );
    if (!REQUIRED_TABLES.every((table) => tables.has(table)))
      return { ok: false, reason: NOT_A_BACKUP };
    const { n } = sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as {
      n: number;
    };
    // One file, with no write-ahead log beside it, so the rename at startup moves everything.
    sqlite.pragma("journal_mode = DELETE");
    return { ok: true, migrations: n };
  } catch {
    return { ok: false, reason: NOT_A_BACKUP };
  } finally {
    sqlite?.close();
  }
}

/**
 * Stages a copy (made in the data folder) for the next start, if it's a Hub
 * database: first `saveCurrent` keeps today's data as a backup, then the copy takes
 * the staged file's place. A copy that isn't a Hub database is removed.
 */
export async function stageRestore(
  copyPath: string,
  dataDir: string,
  saveCurrent: () => Promise<unknown>,
): Promise<BackupCheck> {
  const check = checkBackupFile(copyPath);
  if (!check.ok) {
    rmSync(copyPath, { force: true });
    return check;
  }
  try {
    await saveCurrent();
  } catch (error) {
    rmSync(copyPath, { force: true });
    throw error;
  }
  renameSync(copyPath, join(dataDir, PENDING_RESTORE));
  return check;
}

/**
 * At startup, before opening the database: puts a staged backup in its place. The
 * data it replaces was saved to backups/pre-restore-*.sqlite3 when the restore was
 * asked for. A staged file that no longer checks out is set aside, not used.
 * Returns whether a backup was restored.
 */
export function applyPendingRestore(dataDir: string, dbFile: string): boolean {
  const pending = join(dataDir, PENDING_RESTORE);
  if (!existsSync(pending)) return false;
  const check = checkBackupFile(pending);
  if (!check.ok) {
    renameSync(pending, `${pending}.rejected`);
    log.error("A staged restore failed its check and was set aside", { reason: check.reason });
    return false;
  }
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbFile}${suffix}`, { force: true });
  renameSync(pending, dbFile);
  log.info("Backup restored", { migrations: check.migrations });
  return true;
}
