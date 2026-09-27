import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("a book gets accounts and transactions, with balances that follow", async ({
  page,
}, testInfo) => {
  // Both device runs share one database, so names are unique per run.
  const book = `Personal ${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);

  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  if (testInfo.project.name === "iphone") {
    await nav.getByRole("link", { name: "More" }).click();
    await page
      .getByRole("navigation", { name: "More pages" })
      .getByRole("link", { name: "Money" })
      .click();
  } else {
    await nav.getByRole("link", { name: "Money" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Money" })).toBeVisible();

  // The first run starts with no books; later ones open the Books sheet instead.
  await page.getByRole("button", { name: /^(Add a book|Books)$/ }).click();
  const books = page.getByRole("dialog", { name: "Books" });
  await books.getByLabel("New book").fill(book);
  await expect(books.getByLabel("Start with common categories")).toBeChecked();
  await books.getByRole("button", { name: "Add book" }).click();
  await expect(books.getByText(book, { exact: true })).toBeVisible();
  await books.getByRole("button", { name: "Close" }).click();

  // A new book starts empty and asks for an account.
  await expect(page.getByRole("region", { name: "Add your accounts" })).toBeVisible();
  await page.getByRole("button", { name: "Add account" }).first().click();
  let sheet = page.getByRole("dialog", { name: "Add account" });
  await sheet.getByLabel("Name").fill("Checking");
  await sheet.getByLabel("Opening balance").fill("1000");
  await sheet.getByRole("button", { name: "Add account" }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: "Add account" }).first().click();
  sheet = page.getByRole("dialog", { name: "Add account" });
  await sheet.getByLabel("Name").fill("Card");
  await sheet.getByLabel("Kind").selectOption({ label: "Credit card" });
  await sheet.getByLabel("Opening balance").fill("-250x");
  await expect(sheet.getByText("with a minus sign for money owed")).toBeVisible();
  await sheet.getByLabel("Opening balance").fill("-250");
  await sheet.getByRole("button", { name: "Add account" }).click();
  await expect(sheet).toBeHidden();

  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions).toContainText("No transactions yet.");

  // Money out, then money in.
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  sheet = page.getByRole("dialog", { name: "Add transaction" });
  await sheet.getByRole("button", { name: "Add transaction" }).click();
  await expect(sheet.getByText("Enter an amount like 12.50.")).toBeVisible();
  await sheet.getByLabel("Amount").fill("42.50");
  await sheet.getByLabel("Paid to").fill("Corner grocery");
  await sheet.getByLabel("Account").selectOption({ label: "Checking" });
  await sheet.getByLabel("Category").selectOption({ label: "Groceries" });
  await sheet.getByRole("button", { name: "Add transaction" }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: "Add transaction" }).first().click();
  sheet = page.getByRole("dialog", { name: "Add transaction" });
  await sheet.getByRole("radio", { name: "Money in" }).check();
  await sheet.getByLabel("Amount").fill("1500");
  await sheet.getByLabel("From").fill("Example Employer");
  await sheet.getByLabel("Account").selectOption({ label: "Checking" });
  await sheet.getByLabel("Category").selectOption({ label: "Paycheck" });
  await sheet.getByRole("button", { name: "Add transaction" }).click();
  await expect(sheet).toBeHidden();

  const accounts = page.getByRole("region", { name: "Accounts" });
  await expect(accounts.getByRole("button", { name: /Checking/ })).toContainText("$2,457.50");
  await expect(accounts.getByRole("button", { name: /Card/ })).toContainText("-$250");
  await expect(accounts).toContainText("Net balance$2,207.50");
  await expect(page.getByText(`${book}: 2 accounts, $2,207.50 net`)).toBeVisible();
  await expect(transactions).toContainText("2 transactions · $1,500 in · $42.50 out");

  // Search and filters.
  await transactions.getByLabel("Search").fill("grocery");
  await expect(transactions).toContainText("1 transaction · $0 in · $42.50 out");
  await transactions.getByLabel("Search").fill("");
  await transactions.getByLabel("Category").selectOption({ label: "Uncategorized" });
  await expect(transactions).toContainText("No transactions match.");
  await transactions.getByLabel("Category").selectOption({ label: "All categories" });

  // Editing an amount moves the balance.
  await transactions.getByRole("button", { name: /Corner grocery/ }).click();
  sheet = page.getByRole("dialog", { name: "Transaction" });
  await expect(sheet.getByLabel("Amount")).toHaveValue("42.50");
  await sheet.getByLabel("Amount").fill("45");
  await sheet.getByRole("button", { name: "Save transaction" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Transaction saved");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(accounts.getByRole("button", { name: /Checking/ })).toContainText("$2,455");

  // Categories: add one, delete an unused starter.
  await page.getByRole("button", { name: "Categories" }).click();
  const categories = page.getByRole("dialog", { name: "Categories" });
  await categories.getByLabel("New category").fill("Pet care");
  await categories.getByRole("button", { name: "Add category" }).click();
  await expect(categories.getByText("Pet care", { exact: true })).toBeVisible();
  await categories.getByRole("button", { name: "Delete Gifts" }).click();
  await expect(categories.getByText("Gifts", { exact: true })).toBeHidden();
  await expect(categories.getByRole("button", { name: "Delete Groceries" })).toHaveCount(0);
  await categories.getByRole("button", { name: "Close" }).click();

  // An account with transactions can be archived, not deleted.
  await accounts.getByRole("button", { name: /Checking/ }).click();
  sheet = page.getByRole("dialog", { name: "Account" });
  await expect(sheet).toContainText("$1,000 opening balance and 2 transactions");
  await expect(sheet.getByRole("button", { name: "Delete account" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Archive account" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
