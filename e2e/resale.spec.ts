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
  await sheet.getByLabel("Bought on").fill("2020-01-02");
  await sheet.getByRole("button", { name: "Add item" }).click();
  await expect(sheet).toBeHidden();

  const card = page.getByRole("button", { name: new RegExp(title) });
  await expect(card).toContainText("$12.50");
  await expect(card).toContainText("Acquired");
  await expect(card).toContainText(`${platform} · Garage sale`);
  await expect(card).toContainText(/Held \d+ days/);

  // List it, then drop the price. Listing marks the item listed.
  await card.click();
  const edit = page.getByRole("dialog", { name: "Item" });
  const listings = edit.getByRole("region", { name: "Listings" });
  await expect(listings).toContainText("Not listed anywhere yet.");
  await listings.getByLabel("Listing platform").selectOption({ label: platform });
  await listings.getByLabel("Asking price").fill("90");
  await listings.getByLabel("Listing link").fill("https://example.com/listing/1");
  await listings.getByRole("button", { name: "Add listing" }).click();
  await expect(listings).toContainText("Listed on 1 platform.");
  await expect(edit.getByLabel("Status")).toHaveValue("listed");
  await listings.getByRole("button", { name: "Change price" }).click();
  await listings.getByLabel("New price").fill("75");
  await listings.getByRole("button", { name: "Save price" }).click();
  await expect(listings).toContainText("$90 → $75");
  await expect(listings.getByRole("link", { name: "Open link" })).toHaveAttribute(
    "href",
    "https://example.com/listing/1",
  );

  // Costs and time spent.
  const costs = edit.getByRole("region", { name: "Costs" });
  await expect(costs).toContainText("No costs yet.");
  await costs.getByLabel("Cost type").selectOption({ label: "Parts" });
  await costs.getByLabel("Cost amount").fill("8.50");
  await costs.getByLabel("What the cost was for").fill("Light seals");
  await costs.getByRole("button", { name: "Add cost" }).click();
  await expect(costs).toContainText("$8.50 in costs. $21 in with the price paid.");
  await expect(costs.getByText("Parts: Light seals")).toBeVisible();
  const time = edit.getByRole("region", { name: "Time" });
  await time.getByRole("button", { name: "Start timer" }).click();
  await time.getByRole("button", { name: "Stop timer" }).click();
  await expect(time).toContainText("1 min logged.");
  await edit.getByRole("button", { name: "Close" }).click();
  await expect(card).toContainText("Listed");
  await expect(card).toContainText(`Asking $75 on ${platform}`);
  await expect(card).toContainText("+$8.50 costs");
  await expect(card).toContainText("1 min spent");

  // Filter by status.
  await page.getByRole("radio", { name: /^Sold/ }).check();
  await expect(card).toBeHidden();
  await page.getByRole("radio", { name: /^Listed/ }).check();
  await expect(card).toBeVisible();

  // Sell it: the listing comes down and the card shows the sale.
  await card.click();
  await edit.getByLabel("Status").selectOption({ label: "Sold" });
  await edit.getByLabel("Sold for").fill("70");
  await edit.getByLabel("Sold on platform").selectOption({ label: platform });
  await edit.getByLabel("Buyer notes").fill("Picked up, paid cash");
  await edit.getByRole("button", { name: "Save item" }).click();
  await expect(edit.getByRole("status")).toHaveText("Item saved");
  await expect(listings).toContainText("No open listings.");
  await expect(listings.getByRole("button", { name: "Reopen listing" })).toBeVisible();
  await edit.getByRole("button", { name: "Close" }).click();
  await page.getByRole("radio", { name: /^Sold/ }).check();
  await expect(card).toContainText(`Sold for $70 on ${platform}`);
  await expect(card).toContainText(/Sold after \d+ days/);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
