import { expect, type Page, type TestInfo, test } from "@playwright/test";

/**
 * Collects console errors and uncaught exceptions, including Content-Security-Policy
 * violations. Assert on it BEFORE taking a screenshot: in WebKit, Playwright inserts a
 * temporary <style> element to prepare screenshots, and the app's CSP correctly blocks it,
 * which logs an error that has nothing to do with the app.
 */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Full-page screenshot saved with the test results. Always the last step of a test. */
async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

const DEFAULT_ACCENT = "#22d3ee";

test("home shows system status", async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("John");
  const system = page.getByRole("region", { name: "System" });
  await expect(system.getByText("Database")).toBeVisible();
  await expect(system.getByText("Dev login")).toBeVisible();
  expect(errors).toEqual([]);
  await screenshot(page, testInfo, "home");
});

test("accent color can be changed and is remembered", async ({ page }, testInfo) => {
  // Every attempt (including retries) starts from the default accent, because all
  // tests share one database.
  const reset = await page.request.put("/api/settings", { data: { accentColor: DEFAULT_ACCENT } });
  expect(reset.ok()).toBe(true);

  const errors = trackErrors(page);
  const choice =
    testInfo.project.name === "iphone"
      ? { name: "Pink", hex: "#ff5fb7" }
      : { name: "Lime", hex: "#9be22d" };

  await page.goto("/");
  // On phones, Settings is under More once there are more pages than tabs.
  const nav = page.getByRole("navigation", { name: "Main" });
  if (testInfo.project.name === "iphone") {
    await nav.getByRole("link", { name: "More" }).click();
    await page
      .getByRole("navigation", { name: "More pages" })
      .getByRole("link", { name: "Settings" })
      .click();
  } else {
    await nav.getByRole("link", { name: "Settings" }).click();
  }
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
  expect(errors).toEqual([]);
  await screenshot(page, testInfo, "settings");
});

test("unknown pages show a way back", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Go to home" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});
