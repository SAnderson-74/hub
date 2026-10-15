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

/** The 10th of the month `months` from `date`'s. */
function monthsFrom(date: string, months: number): string {
  const [year, month] = date.split("-").map(Number) as [number, number];
  return `${new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 8)}10`;
}

async function newBook(page: Page, name: string) {
  const post = async (url: string, data: object) => {
    const res = await page.request.post(url, { data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const book = await post("/api/money/books", { name, kind: "personal", starterCategories: true });
  const account = (accountName: string, kind: string, openingBalanceCents: number) =>
    post("/api/money/accounts", { bookId: book.id, name: accountName, kind, openingBalanceCents });
  await page.addInitScript((value) => {
    localStorage.setItem("hub.money.book", value);
  }, String(book.id));
  return { book, account, post };
}

test("debts get a payoff plan, and extra payments show what they save", async ({
  page,
}, testInfo) => {
  const errors = trackErrors(page);
  const { account } = await newBook(page, `Debts ${testInfo.project.name} ${Date.now() % 100000}`);
  await account("Store card", "credit_card", -200_000);
  await account("Car loan", "loan", -500_000);

  await page.goto("/money?do=debts");
  await expect(page.getByRole("radio", { name: "Debts", exact: true })).toBeChecked();
  const list = page.getByRole("region", { name: "Your debts" });
  const plan = page.getByRole("region", { name: "Payoff plan" });
  await expect(plan).toContainText("Leaves out Store card, Car loan");

  const card = list.getByRole("listitem").filter({ hasText: "Store card" });
  await card.getByLabel("Yearly rate (%)").fill("24.99");
  await card.getByLabel("Minimum payment").fill("50");
  await card.getByRole("button", { name: "Save terms" }).click();
  await expect(card).toContainText("24.99% · $50 minimum");
  const loan = list.getByRole("listitem").filter({ hasText: "Car loan" });
  await loan.getByLabel("Yearly rate (%)").fill("abc");
  await loan.getByLabel("Minimum payment").fill("150");
  await loan.getByRole("button", { name: "Save terms" }).click();
  await expect(loan.getByText("Use a rate like 24.99 and a minimum like 35.")).toBeVisible();
  await loan.getByLabel("Yearly rate (%)").fill("6");
  await loan.getByRole("button", { name: "Save terms" }).click();
  await expect(loan).toContainText("6% · $150 minimum");

  // Highest rate first by default; $100 extra saves interest and time.
  await expect(plan.getByRole("radio", { name: /Highest rate first/ })).toBeChecked();
  await expect(plan.getByRole("row", { name: /Highest rate first/ })).toBeVisible();
  await plan.getByLabel("Extra each month").fill("10000");
  await expect(plan).toContainText(/\$100 extra saves \$[\d,.]+ in interest and \d+ (year|month)/);
  await expect(page.getByText("Minimums plus extra")).toBeVisible();

  await plan.getByRole("radio", { name: /My own order/ }).check();
  const order = plan.getByRole("region", { name: "Your order" });
  await expect(order.getByRole("listitem").first()).toContainText("1. Store card");
  await order.getByRole("button", { name: "Move Car loan up" }).click();
  await expect(order.getByRole("listitem").first()).toContainText("1. Car loan");
  await plan.getByRole("button", { name: "Save plan" }).click();
  await expect(plan.getByText("Plan saved")).toBeVisible();

  await page.reload();
  await expect(plan.getByRole("radio", { name: /My own order/ })).toBeChecked();
  await expect(order.getByRole("listitem").first()).toContainText("1. Car loan");
  await expect(plan.getByLabel("Extra each month")).toHaveValue("10000");
  expect(errors).toEqual([]);
});

test("money health and a projection to play with", async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  const today = serverToday();
  const { book, account, post } = await newBook(
    page,
    `Health ${testInfo.project.name} ${Date.now() % 100000}`,
  );
  const checking = await account("Checking", "checking", 600_000);
  const categories: Array<{ id: number; name: string }> = await (
    await page.request.get(`/api/money/categories?bookId=${book.id}`)
  ).json();
  const id = (name: string) => categories.find((row) => row.name === name)?.id ?? null;
  const lastMonth = monthsFrom(today, -1);
  await post("/api/money/transactions", {
    accountId: checking.id,
    date: lastMonth,
    amountCents: 500_000,
    payee: "Example Employer",
    categoryId: id("Paycheck"),
  });
  await post("/api/money/transactions", {
    accountId: checking.id,
    date: lastMonth,
    amountCents: -300_000,
    payee: "Example Property Management",
    categoryId: id("Housing"),
  });

  await page.goto("/money?do=net-worth");
  const health = page.getByRole("region", { name: "Money health" });
  // $8,000 on hand over $3,000 a month, and $2,000 of $5,000 kept.
  await expect(health).toContainText("From the last full month");
  await expect(health).toContainText("Months covered2.7Building");
  await expect(health).toContainText("Savings rate40%Strong");

  const projection = page.getByRole("region", { name: "Where it could go" });
  await expect(projection).toContainText("Lately about $2,000.");
  await expect(projection).toContainText(/In 10 years: about/);
  await projection.getByLabel("Years ahead").fill("20");
  await expect(projection).toContainText(/In 20 years: about/);
  await projection.getByLabel("Yearly return").fill("0");
  await expect(projection).toContainText("growth adds $0");
  expect(errors).toEqual([]);
});
