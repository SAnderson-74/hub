import { expect, type Page, test } from "@playwright/test";

/** Collects console errors and uncaught exceptions (including CSP violations). */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("home shows system status", async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("John");
  const system = page.getByRole("region", { name: "System" });
  await expect(system.getByText("Database")).toBeVisible();
  await expect(system.getByText("Dev login")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("home.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("accent color can be changed and is remembered", async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  // Both projects share one database, so each picks a different color.
  const choice =
    testInfo.project.name === "iphone"
      ? { name: "Pink", hex: "#ff5fb7" }
      : { name: "Lime", hex: "#9be22d" };

  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Settings" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  await page.getByRole("radio", { name: choice.name }).check();
  await page.getByRole("button", { name: "Save accent" }).click();
  await expect(page.getByRole("status")).toHaveText("Accent saved");

  await page.reload();
  await expect(page.getByRole("radio", { name: choice.name })).toBeChecked();
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
  );
  expect(accent).toBe(choice.hex);
  await page.screenshot({ path: testInfo.outputPath("settings.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("unknown pages show a way back", async ({ page }) => {
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Go to home" }).click();
  await expect(page).toHaveURL(/\/$/);
});
