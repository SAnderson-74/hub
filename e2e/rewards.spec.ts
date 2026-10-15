import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("a card's rewards count by category and by store", async ({ page }, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const post = async (url: string, data: object) => {
    const res = await page.request.post(url, { data });
    expect(res.ok()).toBe(true);
    return res.json();
  };
  const book = await post("/api/money/books", {
    name: `Rewards ${id}`,
    kind: "personal",
    starterCategories: true,
  });
  const account = await post("/api/money/accounts", {
    bookId: book.id,
    name: "Rewards account",
    kind: "credit_card",
  });
  await post("/api/money/cards", { accountId: account.id, name: "Store card", last4: "4321" });
  const categories: Array<{ id: number; name: string }> = await (
    await page.request.get(`/api/money/categories?bookId=${book.id}`)
  ).json();
  const dining = categories.find((category) => category.name === "Dining out");
  const year = new Date().getFullYear();
  for (const [payee, cents, categoryId] of [
    ["Pizza place", -10_000, dining?.id ?? null],
    ["EXAMPLE STORE #12", -5_000, null],
    ["Corner gas", -2_000, null],
  ] as const) {
    await post("/api/money/transactions", {
      accountId: account.id,
      date: `${year}-01-15`,
      amountCents: cents,
      payee,
      categoryId,
    });
  }

  await page.addInitScript((value) => {
    localStorage.setItem("hub.money.book", value);
    localStorage.setItem("hub.money.view", "rewards");
  }, String(book.id));
  await page.goto("/money");
  const panel = page.getByRole("region", { name: "Store card ••4321" });
  await expect(panel).toContainText("$170 spent with this card");
  await panel.getByRole("button", { name: "Set up rewards" }).click();

  const sheet = page.getByRole("dialog", { name: "Card rewards" });
  await sheet.getByLabel("Cash back on everything else").fill("1");
  await sheet.getByLabel("Annual fee").fill("2");
  await sheet.getByRole("button", { name: "Add category rate" }).click();
  await sheet.getByLabel("On category").selectOption({ label: "Dining out" });
  const rates = sheet.getByRole("textbox", { name: "Rate", exact: true });
  await rates.fill("3");
  await sheet.getByRole("button", { name: "Add store rate" }).click();
  await sheet.getByRole("button", { name: "Save rewards" }).click();
  await expect(sheet.getByText("Enter the store's name.")).toBeVisible();
  await sheet.getByLabel("At stores named").fill("example store");
  await rates.nth(1).fill("5");
  await sheet.getByRole("button", { name: "Save rewards" }).click();
  await expect(sheet).toBeHidden();

  // $3 on dining, $2.50 at the store, and $0.20 on everything else.
  await expect(panel).toContainText("$5.70");
  await expect(panel.getByRole("row", { name: /example store/ })).toContainText("$2.50");
  await expect(page.getByRole("region", { name: "Overview" })).toContainText("$5.70");
  // $5.70 less the $2 fee, against $3.40 from a 2% card.
  await expect(panel).toContainText(
    /Worth it: \$0\.30 more than a flat 2% card would have earned\./,
  );
  expect(errors).toEqual([]);
});

test("points count at what redemptions got for them", async ({ page }, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const post = async (url: string, data: object, method: "post" | "put" = "post") => {
    const res = await page.request[method](url, { data });
    expect(res.ok()).toBe(true);
    return res.json();
  };
  const book = await post("/api/money/books", { name: `Points ${id}`, kind: "personal" });
  const account = await post("/api/money/accounts", {
    bookId: book.id,
    name: "Points account",
    kind: "credit_card",
  });
  const { card } = await post("/api/money/cards", { accountId: account.id, name: "Points card" });
  await post(
    `/api/money/cards/${card.id}/rewards`,
    { kind: "points", baseRate: 200, pointValue: 100, rates: [] },
    "put",
  );
  await post("/api/money/transactions", {
    accountId: account.id,
    date: `${new Date().getFullYear()}-01-15`,
    amountCents: -50_000,
    payee: "Corner gas",
  });

  await page.addInitScript((value) => {
    localStorage.setItem("hub.money.book", value);
    localStorage.setItem("hub.money.view", "rewards");
  }, String(book.id));
  await page.goto("/money");
  const panel = page.getByRole("region", { name: "Points card" });
  await expect(panel).toContainText("1,000 points (about $10)");
  await panel.getByRole("button", { name: "Balances and redemptions" }).click();

  const sheet = page.getByRole("dialog", { name: "Points" });
  await sheet.getByLabel("Points used").fill("2,000");
  await sheet.getByLabel("Worth").fill("30");
  await sheet.getByRole("button", { name: "Add redemption" }).click();
  await expect(sheet.getByText("2,000 points for $30 (1.5¢ each)")).toBeVisible();
  await expect(sheet).toContainText("Your redemptions averaged 1.5¢ a point");
  await sheet.getByRole("button", { name: "Close" }).click();

  await expect(panel).toContainText("1,000 points (about $15)");
  await expect(panel).toContainText("what your redemptions averaged");
  expect(errors).toEqual([]);
});
