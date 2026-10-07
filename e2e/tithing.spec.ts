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
