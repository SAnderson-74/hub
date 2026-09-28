import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backupTo, nightlyBackupName } from "../../server/db/backup";
import { openDatabase } from "../../server/db/client";
import { applyPendingRestore, PENDING_RESTORE } from "../../server/db/restore";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { CHECKING } from "./backups.routes";

let t: TestApp;
let dataDir: string;
const setup = () => {
  dataDir = mkdtempSync(join(tmpdir(), "hub-backups-"));
  t = createTestApp({ dataDir });
  mkdirSync(t.config.backupDir, { recursive: true });
  return t;
};
afterEach(() => {
  t.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const addTask = async (title: string) => body(await t.api.tasks.$post({ json: { title } }));
const backupNow = (name = nightlyBackupName("2030-01-01")) =>
  backupTo(t.sqlite, t.config.backupDir, name);
const upload = (content: Buffer | string) =>
  t.app.request("/api/backups/upload", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: typeof content === "string" ? content : new Uint8Array(content),
  });
/** Waits past the pause before a restart. */
const restartDelay = () => new Promise((resolve) => setTimeout(resolve, 350));
/** Task titles in the database a staged restore would put in place. */
const restoredTitles = () => {
  const dbFile = join(dataDir, "restored.db");
  expect(applyPendingRestore(dataDir, dbFile)).toBe(true);
  const { sqlite } = openDatabase(dbFile);
  const titles = (
    sqlite.prepare("SELECT title FROM tasks ORDER BY id").all() as { title: string }[]
  ).map((row) => row.title);
  sqlite.close();
  return titles;
};
const leftovers = () =>
  readdirSync(dataDir).filter((name) => name === PENDING_RESTORE || name === CHECKING);

describe("backups", () => {
  it("lists backups, newest first, with why each was taken", async () => {
    setup();
    await backupNow();
    writeFileSync(join(t.config.backupDir, "notes.txt"), "not a backup");
    const list = await body(await t.api.backups.$get());
    expect(list).toEqual([
      {
        name: "nightly-2030-01-01.sqlite3",
        kind: "nightly",
        sizeBytes: expect.any(Number),
        createdAt: expect.any(String),
      },
    ]);
  });

  it("downloads a backup as a file", async () => {
    setup();
    const path = await backupNow();
    const res = await t.app.request("/api/backups/nightly-2030-01-01.sqlite3");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="nightly-2030-01-01.sqlite3"',
    );
    expect(Buffer.from(await res.arrayBuffer()).equals(readFileSync(path))).toBe(true);
  });

  it("only serves backups by name", async () => {
    setup();
    await backupNow();
    const missing = await t.app.request("/api/backups/nightly-2029-01-01.sqlite3");
    expect(await failure(missing)).toMatchObject({ status: 404 });
    for (const name of ["..%2Fhub.db", "hub.db", "nightly-2030-01-01.sqlite3.partial"]) {
      const res = await t.app.request(`/api/backups/${name}`);
      expect(res.status, name).toBe(400);
      const restore = await t.app.request(`/api/backups/${name}/restore`, { method: "POST" });
      expect(restore.status, name).toBe(400);
    }
    expect(t.restarts.count).toBe(0);
  });
});

describe("restoring", () => {
  it("stages a listed backup, saves today's data first, and restarts", async () => {
    setup();
    await addTask("Before the backup");
    await backupNow();
    await addTask("After the backup");

    const res = await t.app.request("/api/backups/nightly-2030-01-01.sqlite3/restore", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      message: "Restoring. Hub is restarting, which takes up to a minute.",
    });
    await restartDelay();
    expect(t.restarts.count).toBe(1);

    // Today's data, kept in case the restore was a mistake.
    const saved = (await body(await t.api.backups.$get())).find((b) => b.kind === "pre-restore");
    expect(saved?.name).toMatch(/^pre-restore-\d{8}T\d{6}Z\.sqlite3$/);
    // The backup itself is untouched, and the staged copy has what it had.
    expect(existsSync(join(t.config.backupDir, "nightly-2030-01-01.sqlite3"))).toBe(true);
    expect(restoredTitles()).toEqual(["Before the backup"]);
    expect(leftovers()).toEqual([]);
  });

  it("restores an uploaded backup", async () => {
    setup();
    await addTask("From elsewhere");
    const path = await backupNow();
    const file = readFileSync(path);
    rmSync(path);

    const res = await upload(file);
    expect(res.status).toBe(202);
    await restartDelay();
    expect(t.restarts.count).toBe(1);
    expect(restoredTitles()).toEqual(["From elsewhere"]);
  });

  it("refuses files that aren't Hub backups, and leaves nothing behind", async () => {
    setup();
    const other = join(dataDir, "other.sqlite3");
    const { sqlite } = openDatabase(other);
    sqlite.exec("CREATE TABLE notes (body TEXT)");
    sqlite.close();

    for (const content of ["just some text", readFileSync(other)]) {
      expect(await failure(await upload(content))).toEqual({
        status: 400,
        error: "That file isn't a Hub backup. Pick a .sqlite3 file from Hub's backups.",
      });
    }
    expect(await failure(await upload(""))).toEqual({
      status: 400,
      error: "Choose a backup file to upload.",
    });
    await restartDelay();
    expect(t.restarts.count).toBe(0);
    expect(leftovers()).toEqual([]);
    expect(readdirSync(t.config.backupDir)).toEqual([]);
  });

  it("uploads past the usual request size limit", async () => {
    setup();
    const res = await upload(Buffer.alloc(2 * 1024 * 1024));
    // Refused because it isn't a backup, not because it's over 1 MB.
    expect(await failure(res)).toMatchObject({ status: 400 });
    const json = await t.app.request("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(2 * 1024 * 1024),
    });
    expect(json.status).toBe(413);
  });

  it("runs one restore at a time", async () => {
    setup();
    await backupNow();
    const restore = () =>
      t.app.request("/api/backups/nightly-2030-01-01.sqlite3/restore", { method: "POST" });
    expect((await restore()).status).toBe(202);
    expect(await failure(await restore())).toEqual({
      status: 409,
      error: "A restore is already under way. Wait for Hub to restart.",
    });
    await restartDelay();
    expect(t.restarts.count).toBe(1);
  });
});
