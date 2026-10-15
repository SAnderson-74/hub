import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Today in the e2e server's time zone (scripts/e2e-server.mjs), as YYYY-MM-DD. */
function serverToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

/** `date` moved by whole months, on a day every month has. */
function monthsFrom(date: string, months: number, day = Math.min(Number(date.slice(8, 10)), 28)) {
  const [year, month] = date.split("-").map(Number) as [number, number];
  const moved = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${moved.toISOString().slice(0, 8)}${String(day).padStart(2, "0")}`;
}

/** A fresh book with a checking account, for one test on one device. */
async function setUp(page: Page, name: string) {
  const post = async (url: string, data: object) => {
    const res = await page.request.post(url, { data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const book = await post("/api/money/books", { name, kind: "personal", starterCategories: true });
  const account = await post("/api/money/accounts", {
    bookId: book.id,
    name: "Checking",
    kind: "checking",
    openingBalanceCents: 200_000,
  });
  const categories: Array<{ id: number; name: string }> = await (
    await page.request.get(`/api/money/categories?bookId=${book.id}`)
  ).json();
  const category = (wanted: string) => {
    const found = categories.find((row) => row.name === wanted);
    if (!found) throw new Error(`No ${wanted} category`);
    return found.id;
  };
  const add = (date: string, amountCents: number, payee: string, extra: object = {}) =>
    post("/api/money/transactions", { accountId: account.id, date, amountCents, payee, ...extra });
  await page.addInitScript((value) => {
    localStorage.setItem("hub.money.book", value);
  }, String(book.id));
  return { book, account, category, add, post };
}

test("a category saves up for a cost, a little each month", async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  const today = serverToday();
  const { category } = await setUp(page, `Saving ${testInfo.project.name} ${Date.now() % 100000}`);
  const insurance = category("Insurance");
  const res = await page.request.put("/api/money/budgets", {
    data: { categoryId: insurance, month: today.slice(0, 7), amountCents: 10_000 },
  });
  expect(res.ok()).toBe(true);

  await page.goto("/money?do=budget");
  await page.getByRole("button", { name: /^Options for Insurance/ }).click();
  const sheet = page.getByRole("dialog", { name: "Carry over and save up" });
  await sheet.getByLabel("Save up for a cost").check();
  await expect(sheet.getByLabel("Carry what's left into next month")).toBeChecked();
  await sheet.getByRole("button", { name: "Save settings" }).click();
  await expect(sheet.getByText("Use an amount like 600 or 249.99.")).toBeVisible();
  await sheet.getByLabel("Amount").fill("600");
  // Due in the fifth month from now, counting this one: $120 a month.
  await sheet.getByLabel("Due").fill(monthsFrom(today, 4, 15));
  await sheet.getByLabel("Comes again").selectOption({ label: "Every 6 months" });
  await sheet.getByRole("button", { name: "Save settings" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Settings saved for Insurance")).toBeVisible();

  const saving = page.getByRole("region", { name: "Saving up" });
  await expect(saving).toContainText("$100 of $600");
  await expect(saving).toContainText("Needs $120 a month");
  await saving.getByRole("button", { name: "Budget $120 a month" }).click();
  await expect(saving).toContainText("On track at $120 a month");
  expect(errors).toEqual([]);
});

test("money owed back is matched to its repayment, leaving only your share", async ({
  page,
}, testInfo) => {
  const errors = trackErrors(page);
  const today = serverToday();
  const { category, add } = await setUp(
    page,
    `Owed ${testInfo.project.name} ${Date.now() % 100000}`,
  );
  const dining = category("Dining out");
  // Both today, so this month's budget shows them together.
  await add(today, -8_000, "Pizza Place", { categoryId: dining });
  await add(today, 4_000, "Venmo", { counterparty: "Jane Doe" });

  await page.goto("/money");
  const transactions = page.getByRole("region", { name: "Transactions" });
  await transactions.getByRole("button", { name: /Pizza Place/ }).click();
  const sheet = page.getByRole("dialog", { name: "Transaction" });
  await sheet.getByRole("button", { name: "Someone owes me part of this" }).click();
  await sheet.getByLabel("Who").fill("Jane Doe");
  await sheet.getByRole("button", { name: "Half" }).click();
  await expect(sheet.getByLabel("Amount owed")).toHaveValue("40.00");
  await sheet.getByRole("button", { name: "Add what's owed" }).click();
  await expect(sheet.getByText("Added what Jane Doe owes")).toBeVisible();
  await expect(sheet.getByText("Not paid back yet")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  const owed = page.getByRole("region", { name: "Owed to you" });
  await expect(owed).toContainText("$40 to come back");
  await expect(owed).toContainText("Jane Doe: $40 for Pizza Place");
  await owed.getByRole("button", { name: /^Match repayment: Venmo/ }).click();
  await expect(owed).toBeHidden();

  // The repayment is now a refund in Dining out, so only half counts as spending.
  await transactions.getByRole("button", { name: /Venmo/ }).click();
  await expect(sheet.getByRole("heading", { name: "Pays back" })).toBeVisible();
  await expect(sheet.getByText("Jane Doe: $40 for Pizza Place")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await page.getByRole("radio", { name: "Budget", exact: true }).check();
  await expect(page.getByRole("region", { name: "Categories" })).toContainText(
    "Dining out$40 spent",
  );
  expect(errors).toEqual([]);
});

test("insights compare spending and flag a category running high", async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  const today = serverToday();
  const { category, add } = await setUp(
    page,
    `Trends ${testInfo.project.name} ${Date.now() % 100000}`,
  );
  const dining = category("Dining out");
  for (const months of [-6, -5, -4, -3, -2, -1]) {
    await add(monthsFrom(today, months, 10), -18_000, "Pizza Place", { categoryId: dining });
  }
  await add(today, -32_000, "Pizza Place", { categoryId: dining });

  await page.goto("/money?do=insights");
  await expect(page.getByRole("radio", { name: "Insights", exact: true })).toBeChecked();
  await expect(page.getByRole("region", { name: "Running high" })).toContainText(
    /Dining out is at \$320 in .+, above its usual \$180\./,
  );
  const byCategory = page.getByRole("region", { name: "By category" });
  await expect(byCategory).toContainText("78% more than last month");
  await expect(page.getByRole("region", { name: "By store" })).toContainText("Pizza Place");
  await expect(page.getByRole("region", { name: "Spending by month" })).toContainText(
    /\$320 spent in .+, 78% more than last month/,
  );
  await expect(page.getByRole("region", { name: "Year in review" })).toContainText("Top stores");
  expect(errors).toEqual([]);
});
