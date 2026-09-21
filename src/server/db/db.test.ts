import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listBackups,
  localDateParts,
  nightlyBackupName,
  pruneBackups,
  startBackupScheduler,
} from "./backup";
import { openDatabase } from "./client";
import { migrateWithBackup, pendingMigrationCount } from "./migrate";

const dirs: string[] = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "hub-db-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("migrations", () => {
  it("backs up an existing database before applying a new migration", async () => {
    const dir = tempDir();
    const backupDir = join(dir, "backups");
    const migrationsDir = join(dir, "drizzle");
    cpSync("drizzle", migrationsDir, { recursive: true });
    const { sqlite, db } = openDatabase(join(dir, "hub.db"));

    const first = await migrateWithBackup({ sqlite, db, migrationsDir, backupDir });
    expect(first.applied).toBeGreaterThan(0);
    expect(first.backup).toBeNull(); // nothing to protect in a brand-new database
    expect(pendingMigrationCount(sqlite, migrationsDir)).toBe(0);

    // Simulate a new release that ships one more migration.
    const journalPath = join(migrationsDir, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    journal.entries.push({
      idx: journal.entries.length,
      version: "6",
      when: Date.now() + 60_000,
      tag: "9999_test",
      breakpoints: true,
    });
    writeFileSync(journalPath, JSON.stringify(journal));
    writeFileSync(
      join(migrationsDir, "9999_test.sql"),
      "CREATE TABLE `extra` (`id` integer PRIMARY KEY);\n",
    );
    expect(pendingMigrationCount(sqlite, migrationsDir)).toBe(1);

    const second = await migrateWithBackup({ sqlite, db, migrationsDir, backupDir });
    expect(second.applied).toBe(1);
    expect(second.backup).toMatch(/pre-migrate-\d{8}T\d{6}Z\.sqlite3$/);
    expect(existsSync(second.backup ?? "")).toBe(true);
    expect(readdirSync(backupDir).some((name) => name.endsWith(".partial"))).toBe(false);
    sqlite.close();
  });
});

describe("backups", () => {
  it("computes local dates in the configured time zone", () => {
    const instant = new Date("2026-09-16T05:30:00Z");
    expect(localDateParts(instant, "UTC")).toEqual({ date: "2026-09-16", hour: 5 });
    expect(localDateParts(instant, "America/New_York")).toEqual({ date: "2026-09-16", hour: 1 });
    expect(localDateParts(instant, "America/Los_Angeles")).toEqual({
      date: "2026-09-15",
      hour: 22,
    });
  });

  it("prunes old nightly backups and extra pre-migration backups", () => {
    const dir = tempDir();
    for (const day of ["2026-08-01", "2026-09-10", "2026-09-15"]) {
      writeFileSync(join(dir, nightlyBackupName(day)), "x");
    }
    for (let i = 0; i < 12; i++) {
      writeFileSync(
        join(dir, `pre-migrate-202609${String(i + 10).padStart(2, "0")}T000000Z.sqlite3`),
        "x",
      );
    }
    writeFileSync(join(dir, "notes.txt"), "not a backup");
    const removed = pruneBackups(dir, 14, "2026-09-16");
    expect(removed).toContain("nightly-2026-08-01.sqlite3");
    expect(removed.filter((name) => name.startsWith("pre-migrate-"))).toHaveLength(2);
    expect(existsSync(join(dir, "nightly-2026-09-10.sqlite3"))).toBe(true);
    expect(existsSync(join(dir, "notes.txt"))).toBe(true);
  });

  it("writes one nightly backup once the scheduled hour has passed", async () => {
    const dir = tempDir();
    const { sqlite } = openDatabase(join(dir, "hub.db"));
    sqlite.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    const backupDir = join(dir, "backups");
    const stop = startBackupScheduler({
      sqlite,
      dir: backupDir,
      timeZone: "UTC",
      hour: 3,
      keepDays: 14,
      intervalMs: 60_000,
      now: () => new Date("2026-09-16T04:00:00Z"),
    });
    for (let i = 0; i < 50 && listBackups(backupDir).length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    stop();
    expect(listBackups(backupDir).map((b) => b.name)).toEqual(["nightly-2026-09-16.sqlite3"]);
    sqlite.close();
  });
});
