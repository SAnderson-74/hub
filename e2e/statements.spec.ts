import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("a statement pasted from the Claude Project imports like a bank file", async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const post = async (url: string, data: object) => {
    const res = await page.request.post(url, { data });
    expect(res.ok()).toBe(true);
    return res.json();
  };
  const book = await post("/api/money/books", { name: `Statement ${id}`, kind: "personal" });
  await post("/api/money/accounts", { bookId: book.id, name: "Checking", kind: "checking" });
  const card = await post("/api/money/accounts", {
    bookId: book.id,
    name: "Rewards account",
    kind: "credit_card",
  });
  await post("/api/money/cards", { accountId: card.id, name: "Rewards card", last4: "4321" });
  const date = new Date().toISOString().slice(0, 10);
  // The bank's file already had one of the purchases.
  await post("/api/money/imports", {
    accountId: card.id,
    source: "csv",
    fileName: "earlier.csv",
    transactions: [{ date, amountCents: -6_480, payee: "EXMPL STORE #12", memo: "" }],
  });

  await page.addInitScript((value) => {
    localStorage.setItem("hub.money.book", value);
    localStorage.setItem("hub.money.view", "transactions");
  }, String(book.id));
  await page.goto("/money");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Import transactions" });

  const answer = {
    format: "hub-statement/v1",
    account: { last4: "4321" },
    period: { start: date, end: date },
    closingBalance: -94.8,
    transactions: [
      { date, description: "Example Store", amount: -64.8 },
      { date, description: "Pizza place", amount: -20 },
      { date, description: "Transfer to 000123456789", amount: -10 },
    ],
  };
  await sheet
    .getByLabel("Or paste a statement from your Claude Project")
    .fill(`\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``);
  // The card's last 4 digits pick its account.
  await expect(sheet.getByLabel("Into account").locator("option:checked")).toHaveText(
    "Rewards account",
  );
  await expect(sheet).toContainText("for the account ending in 4321");
  await sheet.getByRole("button", { name: "Check import" }).click();
  await expect(sheet).toContainText("2 transactions to add");
  await expect(sheet).toContainText("1 is already in the account and will be skipped");
  await expect(sheet).toContainText("matching your bank's file");
  await sheet.getByRole("button", { name: "Import 2 transactions" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Imported 2 transactions");
  await expect(sheet.getByText(`Statement ••4321 to ${date}`)).toBeVisible();
  await sheet.getByRole("button", { name: "Done" }).click();

  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByRole("button", { name: /Transfer to ••6789/ })).toBeVisible();
  await expect(transactions.getByRole("button", { name: /Pizza place/ })).toBeVisible();

  // The same answer in Paste from Claude finds its way to the same import.
  await page.goto("/settings");
  await page
    .getByRole("region", { name: "Imports" })
    .getByRole("button", { name: /Paste from Claude/ })
    .click();
  const paste = page.getByRole("dialog", { name: "Paste from Claude" });
  await paste.getByLabel("Claude Project answer").fill(JSON.stringify(answer));
  await expect(paste.getByText("Bank statement, into Money")).toBeVisible();
  await paste.getByRole("button", { name: "Check import" }).click();
  await expect(paste).toContainText("3 are already in the account and will be skipped");
  await expect(paste.getByRole("button", { name: "Nothing to import" })).toBeDisabled();
  expect(errors).toEqual([]);
});
