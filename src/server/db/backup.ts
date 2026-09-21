import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { errorFields, log } from "../log";
import type { Sqlite } from "./client";

const NIGHTLY = /^nightly-(\d{4}-\d{2}-\d{2})\.sqlite3$/;
const PRE_MIGRATE = /^pre-migrate-\d{8}T\d{6}Z\.sqlite3$/;
const KEEP_PRE_MIGRATE = 10;

export type BackupInfo = { name: string; sizeBytes: number; createdAt: Date };

/** Local calendar date and hour in `timeZone`, e.g. { date: "2026-09-15", hour: 3 }. */
export function localDateParts(now: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function utcStamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** Online, consistent copy of the live database. Writes to a temp file, then renames. */
export async function backupTo(sqlite: Sqlite, dir: string, name: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const finalPath = join(dir, name);
  const tempPath = `${finalPath}.partial`;
  rmSync(tempPath, { force: true });
  await sqlite.backup(tempPath);
  renameSync(tempPath, finalPath);
  return finalPath;
}

export function preMigrateBackupName(now = new Date()): string {
  return `pre-migrate-${utcStamp(now)}.sqlite3`;
}

export function nightlyBackupName(localDate: string): string {
  return `nightly-${localDate}.sqlite3`;
}

export function listBackups(dir: string): BackupInfo[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => NIGHTLY.test(name) || PRE_MIGRATE.test(name))
    .map((name) => {
      const stat = statSync(join(dir, name));
      return { name, sizeBytes: stat.size, createdAt: stat.mtime };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Deletes nightly backups older than `keepDays` and all but the newest pre-migration backups. */
export function pruneBackups(dir: string, keepDays: number, today: string): string[] {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
  const removed: string[] = [];
  const backups = listBackups(dir);
  for (const backup of backups) {
    const match = NIGHTLY.exec(backup.name);
    if (match?.[1] && new Date(`${match[1]}T00:00:00Z`) < cutoff) {
      rmSync(join(dir, backup.name), { force: true });
      removed.push(backup.name);
    }
  }
  const preMigrate = backups.filter((b) => PRE_MIGRATE.test(b.name));
  for (const backup of preMigrate.slice(KEEP_PRE_MIGRATE)) {
    rmSync(join(dir, backup.name), { force: true });
    removed.push(backup.name);
  }
  return removed;
}

type SchedulerOptions = {
  sqlite: Sqlite;
  dir: string;
  timeZone: string;
  hour: number;
  keepDays: number;
  intervalMs?: number;
  now?: () => Date;
};

/**
 * Takes one backup per local day, at or after `hour`. Checks every 10 minutes, so a
 * server that was down at the scheduled hour catches up when it starts.
 * Returns a function that stops the scheduler.
 */
export function startBackupScheduler(options: SchedulerOptions): () => void {
  const { sqlite, dir, timeZone, hour, keepDays } = options;
  const now = options.now ?? (() => new Date());
  let running = false;

  const tick = async () => {
    if (running) return;
    const { date, hour: currentHour } = localDateParts(now(), timeZone);
    if (currentHour < hour) return;
    const name = nightlyBackupName(date);
    if (listBackups(dir).some((b) => b.name === name)) return;
    running = true;
    try {
      await backupTo(sqlite, dir, name);
      const removed = pruneBackups(dir, keepDays, date);
      log.info("Nightly backup written", { backup: name, pruned: removed.length });
    } catch (error) {
      log.error("Nightly backup failed", errorFields(error));
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs ?? 10 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
