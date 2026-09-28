import { writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/** A Hub database file holding one task, like a backup from another install. */
function backupFile(path: string, title: string) {
  const sqlite = new Database(path);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite
    .prepare("INSERT INTO tasks (title, created_at, updated_at) VALUES (?, ?, ?)")
    .run(title, Date.now(), Date.now());
  sqlite.close();
}

async function inboxTitles(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/tasks?projectId=inbox");
  expect(res.ok()).toBe(true);
  return ((await res.json()) as Array<{ title: string }>).map((task) => task.title);
}

/** Confirms the restore shown and waits for the page to reload once Hub is back. */
async function confirmAndWait(page: Page) {
  const reloaded = page.waitForEvent("load", { timeout: 60_000 });
  await page.getByRole("button", { name: "Restore backup" }).click();
  await expect(page.getByText("Restoring. Hub is restarting")).toBeVisible();
  await reloaded;
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
}

test("a backup file can be restored, and the restore undone", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const mine = `Before restoring ${testInfo.project.name} ${Date.now()}`;
  const fromFile = `From the backup file ${testInfo.project.name}`;
  expect((await page.request.post("/api/tasks", { data: { title: mine } })).ok()).toBe(true);
  const file = testInfo.outputPath("hub-backup.sqlite3");
  backupFile(file, fromFile);

  await page.goto("/settings");
  const panel = page.getByRole("region", { name: "Backups" });

  // Something that isn't a backup is refused, and nothing changes.
  const notBackup = testInfo.outputPath("notes.sqlite3");
  writeFileSync(notBackup, "just some text");
  await panel.getByLabel("Choose backup file").setInputFiles(notBackup);
  await panel.getByRole("button", { name: "Restore backup" }).click();
  await expect(panel.getByRole("alert")).toHaveText(
    "That file isn't a Hub backup. Pick a .sqlite3 file from Hub's backups.",
  );

  // A real one replaces everything.
  await panel.getByLabel("Choose backup file").setInputFiles(file);
  await expect(panel.getByText(/^hub-backup\.sqlite3 · /)).toBeVisible();
  await confirmAndWait(page);
  expect(await inboxTitles(page)).toEqual([fromFile]);

  // The data from before was saved, so the restore can be undone.
  await panel
    .getByRole("button", { name: /^Restore before a restore from/ })
    .first()
    .click();
  await expect(panel.getByText(/Replace everything in Hub with the backup from/)).toBeVisible();
  await confirmAndWait(page);
  const titles = await inboxTitles(page);
  expect(titles).toContain(mine);
  expect(titles).not.toContain(fromFile);
});
