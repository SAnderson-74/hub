import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./client";
import { applyPendingRestore, checkBackupFile, PENDING_RESTORE, stageRestore } from "./restore";

const dirs: string[] = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "hub-restore-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A migrated Hub database in WAL mode, like the live one, with one setting. */
function hubDatabase(path: string, accent: string) {
  const { sqlite, db } = openDatabase(path);
  migrate(db, { migrationsFolder: "drizzle" });
  sqlite
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES ('accentColor', ?, ?)")
    .run(JSON.stringify(accent), Date.now());
  sqlite.close();
}
const accentIn = (path: string) => {
  const { sqlite } = openDatabase(path);
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = 'accentColor'").get() as {
    value: string;
  };
  sqlite.close();
  return JSON.parse(row.value) as string;
};

describe("checkBackupFile", () => {
  it("accepts a Hub database and counts its migrations", () => {
    const path = join(tempDir(), "hub.sqlite3");
    hubDatabase(path, "#112233");
    const check = checkBackupFile(path);
    expect(check.ok).toBe(true);
    expect(check.ok && check.migrations).toBeGreaterThan(0);
    // Left as one file, ready to be moved.
    expect(existsSync(`${path}-wal`)).toBe(false);
  });

  it("rejects missing, empty, other, and damaged files", () => {
    const dir = tempDir();
    const empty = join(dir, "empty");
    writeFileSync(empty, "");
    const other = join(dir, "other.sqlite3");
    const { sqlite } = openDatabase(other);
    sqlite.exec("CREATE TABLE notes (body TEXT)");
    sqlite.close();
    for (const path of [join(dir, "missing"), empty, other]) {
      expect(checkBackupFile(path)).toEqual({
        ok: false,
        reason: "That file isn't a Hub backup. Pick a .sqlite3 file from Hub's backups.",
      });
    }

    const damaged = join(dir, "damaged.sqlite3");
    hubDatabase(damaged, "#112233");
    checkBackupFile(damaged);
    const bytes = readFileSync(damaged);
    // Keep the header, scramble the rest.
    bytes.fill(0x5a, 100);
    writeFileSync(damaged, bytes);
    expect(checkBackupFile(damaged).ok).toBe(false);
  });
});

describe("stageRestore and applyPendingRestore", () => {
  it("replaces the database, and its WAL files, at the next start", async () => {
    const dir = tempDir();
    const live = join(dir, "hub.db");
    hubDatabase(live, "#000000");
    writeFileSync(`${live}-wal`, "stale");
    const copy = join(dir, "copy.sqlite3");
    hubDatabase(copy, "#abcdef");

    let saved = 0;
    expect((await stageRestore(copy, dir, async () => saved++)).ok).toBe(true);
    expect(saved).toBe(1);
    expect(existsSync(join(dir, PENDING_RESTORE))).toBe(true);
    expect(accentIn(live)).toBe("#000000");

    expect(applyPendingRestore(dir, live)).toBe(true);
    expect(existsSync(join(dir, PENDING_RESTORE))).toBe(false);
    expect(accentIn(live)).toBe("#abcdef");
    expect(applyPendingRestore(dir, live)).toBe(false);
  });

  it("doesn't save or stage a copy that isn't a backup", async () => {
    const dir = tempDir();
    const copy = join(dir, "copy.sqlite3");
    writeFileSync(copy, "nope");
    let saved = 0;
    expect((await stageRestore(copy, dir, async () => saved++)).ok).toBe(false);
    expect(saved).toBe(0);
    expect(existsSync(copy)).toBe(false);
    expect(existsSync(join(dir, PENDING_RESTORE))).toBe(false);
  });

  it("doesn't stage a copy when today's data couldn't be saved", async () => {
    const dir = tempDir();
    const copy = join(dir, "copy.sqlite3");
    hubDatabase(copy, "#abcdef");
    await expect(
      stageRestore(copy, dir, async () => {
        throw new Error("disk full");
      }),
    ).rejects.toThrow("disk full");
    expect(existsSync(copy)).toBe(false);
    expect(existsSync(join(dir, PENDING_RESTORE))).toBe(false);
  });

  it("sets aside a staged file that no longer checks out", () => {
    const dir = tempDir();
    const live = join(dir, "hub.db");
    hubDatabase(live, "#000000");
    writeFileSync(join(dir, PENDING_RESTORE), "damaged");
    expect(applyPendingRestore(dir, live)).toBe(false);
    expect(existsSync(join(dir, `${PENDING_RESTORE}.rejected`))).toBe(true);
    expect(accentIn(live)).toBe("#000000");
  });
});
