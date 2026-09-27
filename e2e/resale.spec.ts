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
  await expect(card).toContainText("$49 profit");

  // Profit: $70 sale, less $12.50 paid and $8.50 in costs.
  await page.getByRole("radio", { name: "Profit" }).check();
  const totals = page.getByRole("region", { name: "Profit" });
  await expect(totals).toContainText("Profit per hour");
  await expect(page.getByRole("region", { name: "By month" })).toContainText(
    /profit over the last 12 months/,
  );
  await expect(page.getByRole("region", { name: "By platform" })).toContainText(/from \d+ sales?/);
  const sale = page
    .getByRole("region", { name: "Sales" })
    .getByRole("button", { name: new RegExp(title) });
  await expect(sale).toContainText("$49");
  await expect(sale).toContainText("Sold for $70, in for $21");
  await expect(sale).toContainText("70% margin");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test("a spreadsheet imports, with incomplete rows flagged to review", async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const csv = [
    "Item,Cost,Purchase Date,Status,Sold For,Date Sold,Platform",
    `Road bike ${id},$120.00,7/1/2030,Sold,210,8/10/2030,Local classifieds`,
    `"Desk lamp, brass ${id}",,2030-02-01,in stock,,,`,
    ",5,,,,,",
  ].join("\n");

  await page.goto("/resale");
  await page
    .getByRole("button", { name: /^Import( a spreadsheet)?$/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Import from a spreadsheet" });
  await sheet.getByLabel("Or paste it").fill(csv);
  await sheet.getByRole("button", { name: "Read columns" }).click();
  // Columns are guessed from the headers.
  await expect(sheet.getByLabel("Title")).toHaveValue("0");
  await expect(sheet.getByLabel("Price paid")).toHaveValue("1");
  await expect(sheet.getByLabel("Sold on platform")).toHaveValue("6");
  await sheet.getByRole("button", { name: "Check import" }).click();
  await expect(sheet).toContainText("2 items to add, 1 flagged to review");
  await expect(sheet).toContainText("1 row has no title and will be skipped");
  await sheet.getByText("Rows to look at").click();
  await expect(sheet).toContainText("No price paid.");
  await sheet.getByRole("button", { name: "Import 2 items" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Import finished");
  await sheet.getByRole("button", { name: "Done" }).click();

  // The flagged item: find it, read why, and mark it reviewed.
  await page.getByRole("radio", { name: "Items" }).check();
  await page.getByRole("radio", { name: /^Needs review/ }).check();
  const lamp = page.getByRole("button", { name: new RegExp(`Desk lamp, brass ${id}`) });
  await expect(lamp).toContainText("Needs review");
  await lamp.click();
  const edit = page.getByRole("dialog", { name: "Item" });
  await expect(edit).toContainText("No price paid.");
  await edit.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(edit.getByRole("button", { name: "Mark reviewed" })).toBeHidden();
  await edit.getByRole("button", { name: "Close" }).click();
  await page.getByRole("radio", { name: /^All/ }).check();
  await expect(lamp).not.toContainText("Needs review");
  await expect(page.getByRole("button", { name: new RegExp(`Road bike ${id}`) })).toContainText(
    "Sold for $210 on Local classifieds, $90 profit",
  );

  // The same file again adds nothing.
  await page.getByRole("button", { name: "Import" }).click();
  await sheet.getByLabel("Or paste it").fill(csv);
  await sheet.getByRole("button", { name: "Read columns" }).click();
  await sheet.getByRole("button", { name: "Check import" }).click();
  await expect(sheet).toContainText("2 rows are already in Hub and will be skipped");
  await expect(sheet.getByRole("button", { name: "Nothing to import" })).toBeDisabled();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test("a pasted listing adds an item, and a Shortcut can add another listing", async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const title = `Stereo receiver ${id}`;
  const platform = `Market ${id}`;
  const errors = trackErrors(page);
  const listing = {
    format: "hub-listing/v1",
    item: { title, brand: "Example", model: "RX-100", condition: "used" },
    listing: {
      platform,
      price: 150,
      title: "Stereo receiver, works great",
      description: "Tested with speakers.",
    },
    purchase: { price: 60, date: "2030-01-10", source: "Garage sale" },
  };

  await page.goto("/resale");
  await page.getByRole("button", { name: "Paste listing" }).click();
  const sheet = page.getByRole("dialog", { name: "Paste a listing" });
  await sheet.getByLabel("Listing").fill("{ not json");
  await sheet.getByRole("button", { name: "Check listing" }).click();
  await expect(sheet.getByRole("alert")).toContainText("That isn't valid JSON.");
  await sheet.getByLabel("Listing").fill(JSON.stringify(listing));
  await sheet.getByRole("button", { name: "Check listing" }).click();
  await expect(sheet).toContainText(`A new item: ${title}`);
  await expect(sheet).toContainText(`New platform: ${platform}`);
  await sheet.getByRole("button", { name: "Add listing" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Listing added");
  await expect(sheet).toContainText(`Added ${title} and listed it on ${platform} for $150.`);
  await sheet.getByRole("button", { name: "Open item" }).click();

  const edit = page.getByRole("dialog", { name: "Item" });
  await expect(edit.getByLabel("Title")).toHaveValue(title);
  await expect(edit.getByLabel("Status")).toHaveValue("listed");
  const listings = edit.getByRole("region", { name: "Listings" });
  await listings.getByText("Stereo receiver, works great").click();
  await expect(listings).toContainText("Tested with speakers.");
  await edit.getByRole("button", { name: "Close" }).click();

  // What an iOS Shortcut sends: no browser headers, same sign-in.
  const response = await page.request.post("/api/resale/listing-import", {
    data: { format: "hub-listing/v1", item: { title }, listing: { platform, price: 120 } },
  });
  expect(response.status()).toBe(201);
  expect((await response.json()).message).toBe(`Listed ${title} on ${platform} for $120.`);
  await page.reload();
  await expect(page.getByRole("button", { name: new RegExp(title) })).toContainText(
    `Asking $120 on ${platform}, $150 on ${platform}`,
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
