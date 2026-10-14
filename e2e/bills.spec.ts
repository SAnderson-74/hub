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
function monthsFrom(date: string, months: number): string {
  const [year, month] = date.split("-").map(Number) as [number, number];
  const moved = new Date(Date.UTC(year, month - 1 + months, 1));
  const day = Math.min(Number(date.slice(8, 10)), 28);
  return `${moved.toISOString().slice(0, 8)}${String(day).padStart(2, "0")}`;
}

function daysFrom(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

test("repeating payments become bills, on a calendar and in the forecast", async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const today = serverToday();
  const post = async (url: string, data: object) => {
    const res = await page.request.post(url, { data });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const book = await post("/api/money/books", {
    name: `Household ${id}`,
    kind: "personal",
    starterCategories: true,
  });
  const account = await post("/api/money/accounts", {
    bookId: book.id,
    name: "Checking",
    kind: "checking",
    openingBalanceCents: 70_000,
  });
  for (const months of [-4, -3, -2, -1]) {
    await post("/api/money/transactions", {
      accountId: account.id,
      date: monthsFrom(today, months),
      amountCents: -4_500,
      payee: "Example Phone Co",
    });
  }

  await page.addInitScript((value) => {
    localStorage.setItem("hub.money.book", value);
  }, String(book.id));
  await page.goto("/money?do=bills");
  await expect(page.getByRole("radio", { name: "Bills", exact: true })).toBeChecked();

  // The phone payments come back as a suggestion to confirm.
  const repeating = page.getByRole("region", { name: "Repeating payments" });
  await expect(repeating).toContainText("Example Phone");
  await repeating.getByRole("button", { name: "Add Example Phone" }).click();
  let sheet = page.getByRole("dialog", { name: "Confirm bill" });
  await expect(sheet.getByLabel("Usual amount")).toHaveValue("45");
  await expect(sheet.getByLabel("How often")).toHaveValue("monthly");
  await expect(sheet.getByLabel("Account")).toHaveValue(String(account.id));
  await sheet.getByRole("button", { name: "Add bill" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Added Example Phone.")).toBeVisible();
  await expect(repeating).toBeHidden();

  // Rent, added by hand, is big enough to take the balance under the warning line.
  const rentDate = daysFrom(today, 3);
  await page.getByRole("button", { name: "Add a bill" }).click();
  sheet = page.getByRole("dialog", { name: "Add a bill" });
  await sheet.getByLabel("Name").fill("Rent");
  await sheet.getByLabel("Usual amount").fill("450");
  await sheet.getByLabel("Next date").fill(rentDate);
  await sheet.getByLabel("Account").selectOption({ label: "Checking" });
  await sheet.getByRole("button", { name: "Add bill" }).click();
  await expect(sheet).toBeHidden();

  const list = page.getByRole("region", { name: "Bills and income" });
  await expect(list.getByRole("button", { name: /^Rent/ })).toBeVisible();
  await expect(list.getByRole("button", { name: /^Example Phone/ })).toBeVisible();
  await expect(list).toContainText("About $495 a month out.");

  // The calendar shows rent on its day, in whichever month that falls.
  const calendar = page.getByRole("region", { name: "Calendar" });
  if (rentDate.slice(0, 7) !== today.slice(0, 7)) {
    await calendar.getByRole("button", { name: "Next month" }).click();
  }
  await calendar.getByRole("button", { name: /: Rent/ }).click();
  await expect(calendar.getByRole("listitem")).toContainText("Rent");

  // The forecast warns before checking falls under $100.
  await page.getByRole("radio", { name: "Forecast", exact: true }).check();
  const warnings = page.getByRole("region", { name: "Warnings" });
  await expect(warnings).toContainText(/Checking could fall below \$100 on /);
  await expect(page.getByRole("region", { name: "Forecast" })).toContainText(
    /Checking: \$520 today/,
  );

  // A lower warning line clears it: the lowest point is $70 after rent, or $25 after the phone.
  await warnings.getByLabel("Warn below").fill("0");
  await warnings.getByRole("button", { name: "Save amount" }).click();
  await expect(warnings).toContainText("No account is expected to fall below $0");

  // Put it back for the other device's run, which shares these settings.
  await warnings.getByLabel("Warn below").fill("100");
  await warnings.getByRole("button", { name: "Save amount" }).click();
  await expect(warnings).toContainText(/Checking could fall below \$100 on /);
  expect(errors).toEqual([]);
});
