import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("receipts pasted from the Claude Project fill in transactions", async ({ page }, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const post = async (url: string, data: object) => {
    const res = await page.request.post(url, { data });
    expect(res.ok()).toBe(true);
    return res.json();
  };
  const book = await post("/api/money/books", {
    name: `Receipts ${id}`,
    kind: "personal",
    starterCategories: true,
  });
  const credit = await post("/api/money/accounts", {
    bookId: book.id,
    name: "Rewards account",
    kind: "credit_card",
  });
  await post("/api/money/accounts", { bookId: book.id, name: "Checking", kind: "checking" });
  await post("/api/money/cards", { accountId: credit.id, name: "Rewards card", last4: "4321" });
  const date = new Date().toISOString().slice(0, 10);
  // The bank's line for the store run, from a file.
  await post("/api/money/imports", {
    accountId: credit.id,
    source: "csv",
    fileName: "statement.csv",
    transactions: [{ date, amountCents: -6_480, payee: "EXMPL STORE #12", memo: "" }],
  });

  await page.addInitScript((value) => {
    localStorage.setItem("hub.money.book", value);
    localStorage.setItem("hub.money.view", "transactions");
  }, String(book.id));
  await page.goto("/money");
  await page.getByRole("button", { name: "Paste receipts" }).click();
  const sheet = page.getByRole("dialog", { name: "Paste receipts" });

  // What the Project answers, code fence and all.
  const answer = {
    format: "hub-receipt/v1",
    receipts: [
      {
        store: "Example Store",
        date,
        total: 64.8,
        cardLast4: "4321",
        items: [
          { name: "Bananas", amount: 1.3, category: "Groceries" },
          { name: "Milk", amount: 38.7, category: "Groceries" },
          { name: "Paper towels", amount: 20, category: "Shopping" },
        ],
      },
      { store: "Farmers market", date, total: 12, category: "Produce" },
    ],
  };
  const paste = sheet.getByLabel("Claude Project answer");
  await paste.fill('Here you go: { "format": "hub-receipt/v1", "receipts": [ }');
  await expect(sheet.getByText("Part of it is missing or changed.")).toBeVisible();
  await paste.fill(`\`\`\`json\n${JSON.stringify(answer, null, 2)}\n\`\`\``);

  await expect(sheet.getByText('Goes on "EXMPL STORE #12"')).toBeVisible();
  await expect(sheet.getByText("Groceries $43.20 · Shopping $21.60")).toBeVisible();
  await expect(sheet.getByText("Pick the account it was paid from.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Add 1 receipt" })).toBeVisible();

  // The cash one needs an account and one of the book's categories.
  await sheet
    .getByLabel("Receipts without a known card were paid from")
    .selectOption({ label: "Checking" });
  await sheet.getByLabel("Produce", { exact: true }).selectOption({ label: "Groceries" });
  await expect(sheet.getByText("Adds a new transaction to Checking")).toBeVisible();
  await sheet.getByRole("button", { name: "Add 2 receipts" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Added 2 receipts");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();

  const transactions = page.getByRole("region", { name: "Transactions" });
  const storeRun = transactions.getByRole("button", { name: /Example Store/ });
  await expect(storeRun).toContainText("Split: Groceries, Shopping · Rewards card · Receipt");
  await expect(transactions.getByRole("button", { name: /Farmers market/ })).toBeVisible();

  // The receipt shows on its transaction, and taking it off puts the bank's line back.
  await storeRun.click();
  const edit = page.getByRole("dialog", { name: "Transaction" });
  const receipt = edit.getByRole("region", { name: "Receipt" });
  await expect(receipt).toContainText("Receipt from Example Store");
  await receipt.locator("summary").click();
  await expect(receipt.getByText("Paper towels")).toBeVisible();
  await receipt.getByRole("button", { name: "Remove receipt" }).click();
  await expect(receipt).toContainText("The transaction goes back to how it was");
  await receipt.getByRole("button", { name: "Remove receipt" }).click();
  await expect(edit).toBeHidden();
  await expect(transactions.getByRole("button", { name: /EXMPL STORE #12/ })).not.toContainText(
    "Split",
  );
  expect(errors).toEqual([]);
});
