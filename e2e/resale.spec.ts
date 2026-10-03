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
  await expect(sheet.getByRole("alert")).toContainText("Copy its whole answer.");
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

test("the buy calculator gives a max offer and fills in from past sales", async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name}${Date.now() % 100000}`;
  const category = `Calculators ${id}`;
  const errors = trackErrors(page);

  // Two past sales in a category of their own, with fees recorded.
  const platform = await page.request.post("/api/resale/platforms", {
    data: { name: `Market ${id}` },
  });
  expect(platform.status()).toBe(201);
  // The answer is every platform; find the new one.
  const platformId = ((await platform.json()) as Array<{ id: number; name: string }>).find(
    (entry) => entry.name === `Market ${id}`,
  )?.id;
  expect(platformId).toBeDefined();
  for (const [paid, sold, fees] of [
    [4_000, 10_000, 1_000],
    [6_000, 14_000, 1_400],
  ] as const) {
    const item = await page.request.post("/api/resale/items", {
      data: {
        title: `Graphing calculator ${id}`,
        category,
        status: "sold",
        purchasedOn: "2020-01-01",
        purchaseCents: paid,
        soldOn: "2020-01-15",
        saleCents: sold,
        salePlatformId: platformId,
      },
    });
    expect(item.status()).toBe(201);
    const cost = await page.request.post(`/api/resale/items/${(await item.json()).id}/costs`, {
      data: { kind: "fees", amountCents: fees },
    });
    expect(cost.status()).toBe(201);
  }

  await page.goto("/resale");
  await page.getByRole("radio", { name: "Calculator" }).check();
  const calculator = page.getByRole("region", { name: "Buy calculator" });
  await expect(calculator).toContainText("Enter the price you expect it to sell for");

  await calculator.getByLabel("Expected price").fill("150");
  await calculator.getByLabel("Target margin (%)").fill("30");
  await calculator.getByLabel("Fees (% of sale)").fill("13");
  await calculator.getByLabel("Flat fees and shipping").fill("5");
  await calculator.getByLabel("Repair and parts").fill("15x");
  await expect(calculator.getByText("Use an amount like 20.")).toBeVisible();
  await calculator.getByLabel("Repair and parts").fill("15");
  // $150 - $24.50 fees - $15 repair - $45 profit.
  await expect(calculator).toContainText("Offer up to$65.50");
  await calculator.getByLabel("Asking price").fill("80");
  await expect(calculator).toContainText("$14.50 over your max offer. At $80: $30.50 profit");
  await calculator.getByLabel("Repair and parts").fill("90");
  await expect(calculator).toContainText("No offer makes your margin");
  await calculator.getByLabel("Repair and parts").fill("15");

  const history = page.getByRole("region", { name: "Your history" });
  await history.getByLabel("Similar items").fill(category.toLowerCase());
  await history.getByLabel("Sold on").selectOption({ label: `Market ${id}` });
  await expect(history).toContainText("2 sales match");
  await expect(history).toContainText("10% of sale");
  await history.getByRole("button", { name: "Fill in from history" }).click();
  await expect(history).toContainText("Filled in from 2 sales.");
  // Median sale $120, fees 10%, margin 49% (50% and 47%); flat fees and repair stay.
  await expect(calculator.getByLabel("Expected price")).toHaveValue("120");
  await expect(calculator.getByLabel("Fees (% of sale)")).toHaveValue("10");
  await expect(calculator.getByLabel("Target margin (%)")).toHaveValue("49");
  await expect(calculator).toContainText("Offer up to$29.20");

  // Fees and margin are remembered on this device.
  await page.reload();
  await expect(page.getByLabel("Fees (% of sale)")).toHaveValue("10");
  await expect(page.getByLabel("Expected price")).toHaveValue("");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test("an item's purchase and sale link to transactions in Money", async ({ page }, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const post = async (url: string, data: object) =>
    (await (await page.request.post(url, { data })).json()) as { id: number };

  const book = await post("/api/money/books", { name: `Links ${id}`, kind: "personal" });
  const card = await post("/api/money/accounts", {
    bookId: book.id,
    name: `Card ${id}`,
    kind: "credit_card",
  });
  const cash = await post("/api/money/accounts", {
    bookId: book.id,
    name: `Cash ${id}`,
    kind: "cash",
  });
  await post("/api/money/transactions", {
    accountId: card.id,
    date: "2030-03-12",
    amountCents: -4_000,
    payee: `Thrift shop ${id}`,
  });
  const item = await post("/api/resale/items", {
    title: `Desk lamp ${id}`,
    purchasedOn: "2030-03-10",
    purchaseCents: 4_000,
    status: "sold",
    soldOn: "2030-04-02",
    saleCents: 9_500,
  });

  await page.goto(`/resale?item=${item.id}`);
  const sheet = page.getByRole("dialog", { name: "Item" });
  const money = sheet.getByRole("region", { name: "In Money" });
  await expect(money).toContainText("Not linked yet.");

  // The card payment two days later is suggested for the purchase.
  await money.getByRole("button", { name: "Link the purchase" }).click();
  const match = money.getByRole("button", { name: new RegExp(`^Link Thrift shop ${id}, -\\$40`) });
  await expect(match).toContainText("Exact amount");
  await match.click();
  await expect(money.getByRole("status")).toHaveText(`Linked to Thrift shop ${id}`);
  await expect(money.getByRole("listitem")).toContainText(`Thrift shop ${id}`);

  // The sale was cash, so it's added to Money from the item.
  await money.getByRole("button", { name: "Link the sale" }).click();
  await money.getByLabel("Account to add it to").selectOption(String(cash.id));
  await money.getByRole("button", { name: "Add to Money" }).click();
  await expect(money.getByRole("status")).toHaveText("The sale was added to Money and linked");
  await expect(money.getByRole("button", { name: /^Unlink/ })).toHaveCount(2);

  // Money shows the link, and it leads back to the item.
  await page.addInitScript((value) => {
    localStorage.setItem("hub.money.book", value);
    localStorage.setItem("hub.money.view", "transactions");
  }, String(book.id));
  await page.goto("/money");
  const row = page.getByRole("button", { name: new RegExp(`Desk lamp ${id}`) }).first();
  await expect(row).toContainText(`Resale: Desk lamp ${id}`);
  await row.click();
  const transaction = page.getByRole("dialog", { name: "Transaction" });
  await transaction.getByRole("link", { name: `Desk lamp ${id}` }).click();
  await expect(page).toHaveURL(new RegExp(`/resale\\?item=${item.id}`));
  await expect(page.getByRole("dialog", { name: "Item" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
