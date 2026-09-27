import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makePrivate } from "./private";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const mode = (path: string) => statSync(path).mode & 0o777;

describe("makePrivate", () => {
  it("limits the data folder, database, and backups to the app's user", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "hub-private-"));
    dirs.push(dataDir);
    const backups = join(dataDir, "backups");
    mkdirSync(backups, { mode: 0o755 });
    for (const file of [
      join(dataDir, "hub.db"),
      join(dataDir, "hub.db-wal"),
      join(backups, "nightly-2030-01-01.sqlite3"),
    ]) {
      writeFileSync(file, "", { mode: 0o644 });
    }

    makePrivate(dataDir);

    expect(mode(dataDir)).toBe(0o700);
    expect(mode(backups)).toBe(0o700);
    expect(mode(join(dataDir, "hub.db"))).toBe(0o600);
    expect(mode(join(dataDir, "hub.db-wal"))).toBe(0o600);
    expect(mode(join(backups, "nightly-2030-01-01.sqlite3"))).toBe(0o600);
  });

  it("skips a folder that doesn't exist", () => {
    expect(() => makePrivate(join(tmpdir(), "hub-private-missing"))).not.toThrow();
  });
});
