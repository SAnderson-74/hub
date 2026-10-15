import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("cards on an account show which one paid", async ({ page }, testInfo) => {
  // Both device runs share one database, so names are unique per run.
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);

  await page.goto("/money");
  await expect(page.getByRole("heading", { level: 1, name: "Money" })).toBeVisible();
  await page.getByRole("button", { name: /^(Add a book|Books)$/ }).click();
  const books = page.getByRole("dialog", { name: "Books" });
  await books.getByLabel("New book").fill(`Cards ${id}`);
  await books.getByRole("button", { name: "Add book" }).click();
  await expect(books.getByText(`Cards ${id}`, { exact: true })).toBeVisible();
  await books.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Add account" }).first().click();
  let sheet = page.getByRole("dialog", { name: "Add account" });
  await sheet.getByLabel("Name").fill("Rewards account");
  await sheet.getByLabel("Kind").selectOption({ label: "Credit card" });
  await sheet.getByRole("button", { name: "Add account" }).click();
  await expect(sheet).toBeHidden();

  // Add the card from the account.
  await page
    .getByRole("region", { name: "Accounts" })
    .getByRole("button", { name: /Rewards account/ })
    .click();
  sheet = page.getByRole("dialog", { name: "Account" });
  const cards = sheet.getByRole("region", { name: "Cards" });
  await cards.getByLabel("New card").fill("Rewards card");
  await cards.getByLabel("Last 4 digits").fill("43x1");
  await expect(cards.getByText("Enter only the last 4 digits")).toBeVisible();
  await cards.getByLabel("Last 4 digits").fill("4321");
  await cards.getByRole("button", { name: "Add card" }).click();
  await expect(cards.getByRole("status")).toHaveText("Rewards card added");
  await expect(cards.getByText("Ending in 4321")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  // A purchase on the account starts with its card.
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  sheet = page.getByRole("dialog", { name: "Add transaction" });
  await sheet.getByLabel("Amount").fill("18.75");
  await sheet.getByLabel("Paid to").fill("Pizza place");
  await expect(sheet.getByLabel("Card").locator("option:checked")).toHaveText(
    "Rewards card ••4321",
  );
  await sheet.getByRole("button", { name: "Add transaction" }).click();
  await expect(sheet).toBeHidden();

  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByRole("button", { name: /Pizza place/ })).toContainText(
    "Rewards card",
  );
  await transactions.getByLabel("Account or card").selectOption({ label: "No card" });
  await expect(transactions).toContainText("No transactions match.");
  await transactions.getByLabel("Account or card").selectOption({ label: "Rewards card ••4321" });
  await expect(transactions.getByRole("button", { name: /Pizza place/ })).toBeVisible();

  expect(errors).toEqual([]);
});
