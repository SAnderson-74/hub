import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("items are added with a purchase, then listed", async ({ page }, testInfo) => {
  // Both device runs share one database, so names are unique per run.
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const platform = `Classifieds ${id}`;
  const title = `Film camera ${id}`;
  const errors = trackErrors(page);

  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  if (testInfo.project.name === "iphone") {
    await nav.getByRole("link", { name: "More" }).click();
    await page
      .getByRole("navigation", { name: "More pages" })
      .getByRole("link", { name: "Resale" })
      .click();
  } else {
    await nav.getByRole("link", { name: "Resale" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Resale" })).toBeVisible();

  // Platforms live in the database, added here.
  await page
    .getByRole("button", { name: /^(Add )?[Pp]latforms$/ })
    .first()
    .click();
  const platforms = page.getByRole("dialog", { name: "Platforms" });
  await platforms.getByLabel("New platform").fill(platform);
  await platforms.getByRole("button", { name: "Add platform" }).click();
  await expect(platforms.getByText(platform, { exact: true })).toBeVisible();
  await expect(platforms.getByText("No items yet").first()).toBeVisible();
  await platforms.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Add item" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add item" });
  await sheet.getByLabel("Title").fill(title);
  await sheet.getByLabel("Price paid").fill("12.5x");
  await expect(sheet.getByText("Use an amount like 12.50.")).toBeVisible();
  await sheet.getByLabel("Price paid").fill("12.50");
  await sheet.getByLabel("Platform").selectOption({ label: platform });
  await sheet.getByLabel("Seller or place").fill("Garage sale");
  await sheet.getByRole("button", { name: "Add item" }).click();
  await expect(sheet).toBeHidden();

  const card = page.getByRole("button", { name: new RegExp(title) });
  await expect(card).toContainText("$12.50");
  await expect(card).toContainText("Acquired");
  await expect(card).toContainText(`${platform} · Garage sale`);

  // List it.
  await card.click();
  const edit = page.getByRole("dialog", { name: "Item" });
  await edit.getByLabel("Status").selectOption({ label: "Listed" });
  await edit.getByRole("button", { name: "Save item" }).click();
  await expect(edit.getByRole("status")).toHaveText("Item saved");
  await edit.getByRole("button", { name: "Close" }).click();
  await expect(card).toContainText("Listed");

  // Filter by status.
  await page.getByRole("radio", { name: /^Sold/ }).check();
  await expect(card).toBeHidden();
  await page.getByRole("radio", { name: /^Listed/ }).check();
  await expect(card).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
