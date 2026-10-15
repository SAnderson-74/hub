import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("first-run setup picks modules and a time zone", async ({ page }) => {
  const errors = trackErrors(page);
  // The shared test database was set up already; show setup as a new install would.
  let finished = false;
  await page.route("**/api/setup", async (route) => {
    if (route.request().method() === "GET" && !finished) {
      await route.fulfill({ json: { needed: true, serverTimeZone: "UTC", demo: false } });
      return;
    }
    if (route.request().method() === "POST") finished = true;
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome to Hub" })).toBeVisible();
  await page.getByRole("checkbox", { name: /^Taxes/ }).uncheck();
  await page.getByLabel("Time zone").selectOption("America/Chicago");
  await page.getByRole("button", { name: "Start using Hub" }).click();

  // The app opens, without the module that was turned off.
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Home" })).toBeVisible();
  await page.goto("/taxes");
  await expect(page.getByRole("heading", { name: "Taxes is off" })).toBeVisible();

  // Settings turns it back on, and sets the time zone back.
  await page.goto("/settings");
  const panel = page.getByRole("region", { name: "Modules and time zone" });
  await expect(panel.getByLabel("Time zone")).toHaveValue("America/Chicago");
  await panel.getByRole("checkbox", { name: /^Taxes/ }).check();
  await panel.getByLabel("Time zone").selectOption("");
  await panel.getByRole("button", { name: "Save modules and time zone" }).click();
  await expect(panel.getByRole("status")).toHaveText("Modules and time zone saved");
  await page.goto("/taxes");
  await expect(page.getByRole("heading", { level: 1, name: "Taxes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Taxes is off" })).toBeHidden();
  expect(errors).toEqual([]);
});
