import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("a habit is checked off, grows stronger, and can change its days", async ({
  page,
}, testInfo) => {
  const errors = trackErrors(page);
  const name = `Floss ${testInfo.project.name} ${Date.now() % 100000}`;
  await page.goto("/habits");
  await expect(page.getByRole("heading", { level: 1, name: "Habits" })).toBeVisible();

  await page.getByRole("button", { name: "Add habit" }).click();
  let sheet = page.getByRole("dialog", { name: "Add a habit" });
  await sheet.getByRole("button", { name: "Add habit" }).click();
  await expect(sheet.getByText("Give the habit a name.")).toBeVisible();
  await sheet.getByLabel("Name").fill(name);
  await sheet.getByRole("button", { name: "Add habit" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(`Added ${name}`)).toBeVisible();

  const today = page.getByRole("region", { name: "Today" });
  await today.getByRole("button", { name: `${name}: check off for today` }).click();
  await expect(today.getByRole("button", { name: `${name}: done today` })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const all = page.getByRole("region", { name: "All habits" });
  const card = all.getByRole("listitem").filter({ hasText: name });
  await expect(card).toContainText("1-day streak");
  await expect(card).toContainText(/Strength [1-9]\d?/);

  // Weekdays only, and yesterday filled in.
  await card.getByRole("button", { name: new RegExp(`^${name}(?!:)`) }).click();
  sheet = page.getByRole("dialog", { name: "Habit" });
  await sheet.getByRole("radio", { name: "On certain days" }).check();
  for (const day of ["Mon", "Wed", "Fri"])
    await sheet.getByRole("checkbox", { name: day }).uncheck();
  await expect(sheet.getByRole("checkbox", { name: "Tue" })).not.toBeChecked();
  await sheet.getByRole("button", { name: "Save habit" }).click();
  await expect(sheet.getByText("Pick at least one day.")).toBeVisible();
  for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"])
    await sheet.getByRole("checkbox", { name: day }).check();
  const pastDays = sheet.getByRole("region", { name: "Past days" });
  const yesterday = pastDays.getByRole("button").nth(12);
  await yesterday.click();
  await expect(yesterday).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Save habit" }).click();
  await expect(sheet).toBeHidden();
  await expect(card).toContainText("Weekdays");

  // Delete it.
  await card.getByRole("button", { name: new RegExp(`^${name}(?!:)`) }).click();
  sheet = page.getByRole("dialog", { name: "Habit" });
  await sheet.getByRole("button", { name: "Delete habit" }).click();
  await sheet.getByRole("button", { name: "Delete habit" }).click();
  await expect(page.getByText(`Deleted ${name}`)).toBeVisible();
  await expect(all).not.toContainText(name);
  expect(errors).toEqual([]);
});

test("a focus block is saved as time when it ends", async ({ page }) => {
  const errors = trackErrors(page);
  // Half an hour ago, so the block ends before the server's now.
  await page.clock.install({ time: new Date(Date.now() - 30 * 60_000) });
  await page.goto("/time");
  const focus = page.getByRole("region", { name: "Focus" });
  await focus.getByLabel("Work").selectOption({ label: "15 minutes" });
  await focus.getByRole("button", { name: "Start focus" }).click();
  // The clock keeps running, so a few seconds may have gone.
  await expect(focus.getByRole("timer")).toHaveText(/^1[45]:\d\d$/);

  await page.clock.fastForward("15:01");
  await expect(focus.getByText("Work block saved: 15 minutes. Take a break.")).toBeVisible();
  await expect(focus).toContainText("Break · 1 done");
  await focus.getByRole("button", { name: "Skip break" }).click();
  await expect(focus.getByRole("button", { name: "Start the next block" })).toBeVisible();
  await focus.getByRole("button", { name: "Finish" }).click();
  await expect(focus.getByText("Done for now: 1 block.")).toBeVisible();
  await expect(focus.getByRole("button", { name: "Start focus" })).toBeVisible();
  expect(errors).toEqual([]);
});
