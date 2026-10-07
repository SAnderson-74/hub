import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("tithing goes from red to green when a payment is matched to the income", async ({
  page,
}, testInfo) => {
  // Both device runs share one database, so each uses its own past year and names.
  const iphone = testInfo.project.name === "iphone";
  const year = iphone ? 2017 : 2016;
  const payee = `Tithing paycheck ${year}`;
  const bookName = `Tithing ${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const post = async (url: string, data: object) => {
    const res = await page.request.post(url, { data });
    if (!res.ok()) throw new Error(`POST ${url} failed: ${res.status()} ${await res.text()}`);
    return (await res.json()) as { id: number };
  };
  const book = await post("/api/money/books", { name: bookName, kind: "personal" });
  const account = await post("/api/money/accounts", {
    bookId: book.id,
    name: "Checking",
    kind: "checking",
  });
  await post("/api/money/transactions", {
    accountId: account.id,
    date: `${year}-03-15`,
    amountCents: 200_000,
    payee,
  });
  // A sale tithed on its $400 profit, not the whole $1,000.
  const sale = await post("/api/money/transactions", {
    accountId: account.id,
    date: `${year}-03-20`,
    amountCents: 100_000,
    payee: `Tithing sale ${year}`,
    tithing: { applies: true, baseCents: 40_000 },
  });
  expect(sale.id).toBeGreaterThan(0);

  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  if (iphone) {
    await nav.getByRole("link", { name: "More" }).click();
    await page
      .getByRole("navigation", { name: "More pages" })
      .getByRole("link", { name: "Tithing" })
      .click();
  } else {
    await nav.getByRole("link", { name: "Tithing" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Tithing" })).toBeVisible();
  await page.getByLabel("Year").selectOption(String(year));

  // Red: $200 on the paycheck and $40 on the sale's profit are both unpaid.
  const income = page.getByRole("region", { name: `Income in ${year}` });
  const paycheck = income.getByRole("button", { name: new RegExp(payee) });
  await expect(paycheck).toContainText("Not paid, $200 owed");
  const saleRow = income.getByRole("button", { name: new RegExp(`Tithing sale ${year}`) });
  await expect(saleRow).toContainText("Not paid, $40 owed");
  await expect(saleRow).toContainText("Tithing on $400 of $1,000");

  // Pay the paycheck's tithing: pick it, pay, and choose the account.
  const open = page.getByRole("region", { name: "Needs tithing paid" });
  await open.getByLabel(`Pick ${payee}`).check();
  await open.getByRole("button", { name: "Pay $200" }).click();
  const sheet = page.getByRole("dialog", { name: "Record a payment" });
  await expect(sheet.getByLabel("Amount", { exact: true })).toHaveValue("200");
  await sheet.getByLabel("Date").fill(`${year}-04-01`);
  await sheet.getByLabel("Paid from").selectOption({ label: `${bookName}: Checking` });
  await expect(sheet).toContainText("Matched $200 of $200.");
  await sheet.getByRole("button", { name: "Record payment" }).click();
  await expect(sheet).toBeHidden();

  // Green: the paycheck is paid, the sale still isn't, and the payment is matched.
  await expect(paycheck).toContainText("Paid");
  await expect(paycheck).not.toContainText("Not paid");
  await expect(saleRow).toContainText("Not paid, $40 owed");
  const payments = page.getByRole("region", { name: `Payments in ${year}` });
  await expect(payments).toContainText("Matched to income");

  // Turn tithing off for the sale, then the chart data and year summary follow.
  await saleRow.click();
  const choice = page.getByRole("dialog", { name: "Tithing on income" });
  await choice.getByLabel("Tithing applies").uncheck();
  await choice.getByRole("button", { name: "Save tithing" }).click();
  await expect(choice).toBeHidden();
  await expect(saleRow).toContainText("Not tithed on");
  await expect(page.getByRole("region", { name: `${year} summary` })).toContainText(
    `${year}'s tithing is paid in full.`,
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test("money in shows tithing on the Money page, and the choice saves with the transaction", async ({
  page,
}, testInfo) => {
  const iphone = testInfo.project.name === "iphone";
  const year = iphone ? 2015 : 2014;
  const bookName = `Tithing money ${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const post = async (url: string, data: object) => {
    const res = await page.request.post(url, { data });
    if (!res.ok()) throw new Error(`POST ${url} failed: ${res.status()} ${await res.text()}`);
    return (await res.json()) as { id: number };
  };
  const book = await post("/api/money/books", { name: bookName, kind: "personal" });
  const account = await post("/api/money/accounts", {
    bookId: book.id,
    name: "Checking",
    kind: "checking",
  });
  await post("/api/money/transactions", {
    accountId: account.id,
    date: `${year}-05-01`,
    amountCents: 50_000,
    payee: "Example Employer",
  });
  await page.addInitScript((id) => localStorage.setItem("hub.money.book", String(id)), book.id);

  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  if (iphone) {
    await nav.getByRole("link", { name: "More" }).click();
    await page
      .getByRole("navigation", { name: "More pages" })
      .getByRole("link", { name: "Money" })
      .click();
  } else {
    await nav.getByRole("link", { name: "Money" }).click();
  }
  const transactions = page.getByRole("region", { name: "Transactions" });
  const row = transactions.getByRole("button", { name: /Example Employer/ });
  await expect(row).toContainText("Tithing: not paid, $50 owed");

  // Tithe on gross pay instead of the deposit.
  await row.click();
  const sheet = page.getByRole("dialog", { name: "Transaction" });
  await expect(sheet.getByLabel("Tithing applies")).toBeChecked();
  await sheet.getByLabel("Only part of it").check();
  await sheet.getByLabel("Pay tithing on").fill("650");
  await sheet.getByRole("button", { name: "Save transaction" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Transaction saved");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(row).toContainText("Tithing: not paid, $65 owed");

  // New money in can start with tithing off.
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  const add = page.getByRole("dialog", { name: "Add transaction" });
  await add.getByRole("radio", { name: "Money in" }).check();
  await add.getByLabel("Amount").fill("20");
  await add.getByLabel("From").fill("Gift");
  await add.getByLabel("Tithing applies").uncheck();
  await add.getByRole("button", { name: "Add transaction" }).click();
  await expect(add).toBeHidden();
  const gift = transactions.getByRole("button", { name: /Gift/ });
  await expect(gift).toBeVisible();
  await expect(gift).not.toContainText("Tithing:");

  expect(errors).toEqual([]);
});

test("tithing lists search, sort, and filter, and old income can be marked paid in bulk", async ({
  page,
}, testInfo) => {
  const iphone = testInfo.project.name === "iphone";
  const year = iphone ? 2013 : 2012;
  const bookName = `Tithing filters ${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const post = async (url: string, data: object) => {
    const res = await page.request.post(url, { data });
    if (!res.ok()) throw new Error(`POST ${url} failed: ${res.status()} ${await res.text()}`);
    return (await res.json()) as { id: number };
  };
  const book = await post("/api/money/books", {
    name: bookName,
    kind: "personal",
    starterCategories: true,
  });
  const categories = (await (
    await page.request.get(`/api/money/categories?bookId=${book.id}`)
  ).json()) as Array<{ id: number; name: string }>;
  const category = (name: string) => categories.find((entry) => entry.name === name)?.id;
  const account = await post("/api/money/accounts", {
    bookId: book.id,
    name: "Checking",
    kind: "checking",
  });
  const income = (date: string, amountCents: number, payee: string, categoryName: string) =>
    post("/api/money/transactions", {
      accountId: account.id,
      date: `${year}-${date}`,
      amountCents,
      payee: `${payee} ${year}`,
      categoryId: category(categoryName),
    });
  await income("02-01", 100_000, "Filter Alpha", "Paycheck");
  await income("03-01", 30_000, "Filter Beta", "Interest");
  await income("06-01", 50_000, "Filter Gamma", "Paycheck");

  // Both device runs share one database: clear earlier years so the catch-up below only
  // finds this run's income.
  await post("/api/tithing/settle", { through: `${year - 1}-12-31` });

  await page.goto("/tithing");
  await expect(page.getByRole("heading", { level: 1, name: "Tithing" })).toBeVisible();
  await page.getByLabel("Year").selectOption(String(year));
  const list = page.getByRole("region", { name: `Income in ${year}` });
  const open = page.getByRole("region", { name: "Needs tithing paid" });
  const row = (name: string) => list.getByRole("button", { name: new RegExp(`${name} ${year}`) });

  // Search: every word, in both lists.
  await page.getByLabel("Search").fill("alpha");
  await expect(row("Filter Alpha")).toBeVisible();
  await expect(row("Filter Beta")).toBeHidden();
  await expect(open.getByRole("button", { name: /Filter Beta/ })).toBeHidden();
  await page.getByLabel("Search").fill("");

  // Sort: smallest first, then largest.
  await page.getByLabel("Sort by").selectOption({ label: "Smallest amount first" });
  await expect(list.getByRole("button", { name: /Filter/ }).first()).toContainText("Filter Beta");
  await page.getByLabel("Sort by").selectOption({ label: "Largest amount first" });
  await expect(list.getByRole("button", { name: /Filter/ }).first()).toContainText("Filter Alpha");

  // Sheet: a range of amounts, then a source.
  await page.getByRole("button", { name: /^More filters/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter income" });
  await sheet.getByLabel("At least", { exact: true }).fill("400");
  await expect(row("Filter Beta")).toBeHidden();
  await expect(row("Filter Alpha")).toBeVisible();
  await sheet.getByLabel("At least", { exact: true }).fill("");
  await sheet.getByLabel("Interest").check();
  await expect(row("Filter Alpha")).toBeHidden();
  await expect(row("Filter Beta")).toBeVisible();
  await sheet.getByRole("button", { name: "Clear filters" }).click();
  await expect(row("Filter Alpha")).toBeVisible();
  await sheet.getByRole("button", { name: /^Show \d+ incomes?$/ }).click();
  await expect(sheet).toBeHidden();

  // Catch up through a date: Alpha and Beta were paid before Hub, Gamma wasn't.
  await open.getByText("Already paid these before using Hub?").click();
  await open.getByLabel("Paid through").fill(`${year}-04-01`);
  await open.getByRole("button", { name: "Mark 2 incomes paid ($130)" }).click();
  await expect(open.getByRole("status")).toHaveText("Marked 2 incomes as paid.");
  await expect(row("Filter Alpha")).toContainText("Paid, marked as paid");
  await expect(row("Filter Beta")).toContainText("Paid, marked as paid");
  await expect(row("Filter Gamma")).toContainText("Not paid, $50 owed");

  // Undo it, then mark one picked income instead.
  await open.getByRole("button", { name: "Undo" }).click();
  await expect(row("Filter Alpha")).toContainText("Not paid, $100 owed");
  await open.getByLabel(`Pick Filter Gamma ${year}`).check();
  await open.getByRole("button", { name: "Mark picked as paid" }).click();
  await expect(row("Filter Gamma")).toContainText("Paid, marked as paid");
  await expect(row("Filter Alpha")).toContainText("Not paid, $100 owed");

  // Marked-paid income opens with a way back.
  await row("Filter Gamma").click();
  const incomeSheet = page.getByRole("dialog", { name: "Tithing on income" });
  await incomeSheet.getByRole("button", { name: "Undo marked as paid" }).click();
  await expect(incomeSheet).toBeHidden();
  await expect(row("Filter Gamma")).toContainText("Not paid, $50 owed");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test("money transactions sort, and filter by dates, amount, and several categories", async ({
  page,
}, testInfo) => {
  const iphone = testInfo.project.name === "iphone";
  const bookName = `Money filters ${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const post = async (url: string, data: object) => {
    const res = await page.request.post(url, { data });
    if (!res.ok()) throw new Error(`POST ${url} failed: ${res.status()} ${await res.text()}`);
    return (await res.json()) as { id: number };
  };
  const book = await post("/api/money/books", {
    name: bookName,
    kind: "personal",
    starterCategories: true,
  });
  const categories = (await (
    await page.request.get(`/api/money/categories?bookId=${book.id}`)
  ).json()) as Array<{ id: number; name: string }>;
  const category = (name: string) => categories.find((entry) => entry.name === name)?.id;
  const account = await post("/api/money/accounts", {
    bookId: book.id,
    name: "Checking",
    kind: "checking",
  });
  const add = (date: string, amountCents: number, payee: string, categoryName?: string) =>
    post("/api/money/transactions", {
      accountId: account.id,
      date,
      amountCents,
      payee,
      ...(categoryName ? { categoryId: category(categoryName) } : {}),
    });
  const old = iphone ? "2011" : "2010";
  await add(`${old}-01-05`, -4_500, "Corner grocery", "Groceries");
  await add(`${old}-01-20`, 200_000, "Example Employer", "Paycheck");
  await add(`${old}-02-10`, -12_000, "Power company", "Utilities");
  await add(`${old}-02-14`, -900, "Coffee shop");
  await page.addInitScript((id) => localStorage.setItem("hub.money.book", String(id)), book.id);

  await page.goto("/money");
  const panel = page.getByRole("region", { name: "Transactions" });
  const rows = panel.getByRole("listitem");
  await expect(rows).toHaveCount(4);

  await panel.getByLabel("Sort by").selectOption({ label: "Largest amount first" });
  await expect(rows.first()).toContainText("Example Employer");
  await panel.getByLabel("Sort by").selectOption({ label: "Oldest first" });
  await expect(rows.first()).toContainText("Corner grocery");

  await panel.getByRole("button", { name: /^More filters/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter transactions" });
  await sheet.getByLabel("At least", { exact: true }).fill("40");
  await expect(rows).toHaveCount(3);
  await sheet.getByLabel("At most", { exact: true }).fill("1000");
  await expect(rows).toHaveCount(2);
  await sheet.getByLabel("At least", { exact: true }).fill("");
  await sheet.getByLabel("At most", { exact: true }).fill("");
  await sheet.getByLabel("From", { exact: true }).fill(`${old}-01-15`);
  await sheet.getByLabel("To", { exact: true }).fill(`${old}-02-10`);
  await expect(rows).toHaveCount(2);
  await sheet.getByRole("button", { name: "Clear filters" }).click();
  await expect(rows).toHaveCount(4);
  await sheet.getByLabel("Groceries").check();
  await sheet.getByLabel("Utilities").check();
  await expect(rows).toHaveCount(2);
  await sheet.getByRole("button", { name: "Show 2 transactions" }).click();
  await expect(panel.getByLabel("Category")).toContainText("2 categories");
  await panel.getByRole("button", { name: "Clear filters" }).click();
  await expect(rows).toHaveCount(4);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
