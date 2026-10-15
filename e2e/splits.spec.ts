import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("one charge can be split across categories", async ({ page }, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const post = async (url: string, data: object) => {
    const res = await page.request.post(url, { data });
    expect(res.ok()).toBe(true);
    return res.json();
  };
  const book = await post("/api/money/books", {
    name: `Splits ${id}`,
    kind: "personal",
    starterCategories: true,
  });
  await post("/api/money/accounts", { bookId: book.id, name: "Checking", kind: "checking" });

  await page.addInitScript((value) => {
    localStorage.setItem("hub.money.book", value);
    localStorage.setItem("hub.money.view", "transactions");
  }, String(book.id));
  await page.goto("/money");
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add transaction" });
  await sheet.getByLabel("Amount", { exact: true }).fill("120");
  await sheet.getByLabel("Paid to").fill("Example Store");
  await sheet.getByLabel("Category", { exact: true }).selectOption({ label: "Groceries" });
  await sheet.getByRole("button", { name: "Split into categories" }).click();

  // The whole amount starts in the first part; the second takes what's moved off it.
  await expect(sheet.getByLabel("Part 1 amount")).toHaveValue("120");
  await sheet.getByLabel("Part 1 amount").fill("80");
  await expect(sheet.getByText("$40 left to split")).toBeVisible();
  await sheet.getByLabel("Part 2 category").selectOption({ label: "Shopping" });
  await sheet.getByLabel("Part 2 amount").fill("40");
  await expect(sheet.getByText("The parts add up.")).toBeVisible();
  await sheet.getByRole("button", { name: "Add transaction" }).click();
  await expect(sheet).toBeHidden();

  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByRole("button", { name: /Example Store/ })).toContainText(
    "Split: Groceries, Shopping",
  );
  // Each part's category finds it.
  await transactions.getByLabel("Category").selectOption({ label: "Shopping" });
  await expect(transactions.getByRole("button", { name: /Example Store/ })).toBeVisible();

  // Opened again, it's still split; picking one category takes the split away.
  await transactions.getByRole("button", { name: /Example Store/ }).click();
  const edit = page.getByRole("dialog", { name: "Transaction" });
  await expect(edit.getByLabel("Part 2 amount")).toHaveValue("40");
  await edit.getByRole("button", { name: "Don't split" }).click();
  await expect(edit.getByLabel("Category", { exact: true }).locator("option:checked")).toHaveText(
    "Groceries",
  );
  await edit.getByRole("button", { name: "Save transaction" }).click();
  await expect(edit.getByRole("status")).toHaveText("Transaction saved");
  await edit.getByRole("button", { name: "Close" }).click();
  await transactions.getByLabel("Category").selectOption({ label: "All categories" });
  await expect(transactions.getByRole("button", { name: /Example Store/ })).toContainText(
    "Groceries",
  );
  await expect(transactions.getByRole("button", { name: /Example Store/ })).not.toContainText(
    "Split",
  );
  expect(errors).toEqual([]);
});
