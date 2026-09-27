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

test("bank files import once, remember their columns, and can be undone", async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const book = `Imports ${id}`;
  const errors = trackErrors(page);

  const created = await page.request.post("/api/money/books", {
    data: { name: book, kind: "personal", starterCategories: true },
  });
  const bookId = (await created.json()).id;
  const account = await page.request.post("/api/money/accounts", {
    data: { bookId, name: "Checking", kind: "checking" },
  });
  expect(account.status()).toBe(201);

  // Open this book, as the page remembers the last one chosen.
  await page.addInitScript(
    (value) => localStorage.setItem("hub.money.book", value),
    String(bookId),
  );
  await page.goto("/money");
  await expect(page.getByText(`${book}: 1 account`)).toBeVisible();

  // Headings Hub doesn't recognize (and unique per run, so no saved layout matches
  // yet) are picked by hand once.
  const csv = [
    `When,Details,Debit,Credit,Category ${id}`,
    "01/05/2030,Corner grocery,42.50,,Groceries",
    '01/06/2030,Example Employer,,"1,500.00",Paycheck',
    "someday,Nothing,1.00,,",
  ].join("\n");
  const file = { name: "checking.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };

  await page.getByRole("button", { name: "Import", exact: true }).click();
  let sheet = page.getByRole("dialog", { name: "Import transactions" });
  await sheet.getByLabel("File", { exact: true }).setInputFiles(file);
  await expect(sheet.getByText("Choose the date column")).toBeVisible();
  await sheet.getByLabel("Date", { exact: true }).selectOption({ label: "When" });
  await sheet.getByLabel("Category", { exact: true }).selectOption({ label: `Category ${id}` });
  await expect(sheet.getByLabel("Money out")).toHaveValue("2");
  await sheet.getByRole("button", { name: "Check import" }).click();
  await expect(sheet).toContainText("2 transactions to add");
  await expect(sheet).toContainText("1 row couldn't be read");
  await expect(sheet).toContainText("Corner grocery");
  await sheet.getByRole("button", { name: "Import 2 transactions" }).click();
  await expect(sheet.getByRole("status").first()).toHaveText("Imported 2 transactions");
  await sheet.getByRole("button", { name: "Done" }).click();

  const accounts = page.getByRole("region", { name: "Accounts" });
  await expect(accounts.getByRole("button", { name: /Checking/ })).toContainText("$1,457.50");
  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByRole("button", { name: /Corner grocery/ })).toContainText(
    "Groceries",
  );

  // The same file again: its columns come back, and nothing is added twice.
  await page.getByRole("button", { name: "Import", exact: true }).click();
  sheet = page.getByRole("dialog", { name: "Import transactions" });
  await sheet.getByLabel("File", { exact: true }).setInputFiles(file);
  await expect(sheet.getByLabel("Date", { exact: true })).toHaveValue("0");
  await expect(sheet.getByLabel("Category", { exact: true })).toHaveValue("4");
  await sheet.getByRole("button", { name: "Check import" }).click();
  await expect(sheet).toContainText("Nothing new to add");
  await expect(sheet).toContainText("2 are already in the account and will be skipped");
  await expect(sheet.getByRole("button", { name: "Nothing to import" })).toBeDisabled();

  // An OFX statement for the same account.
  const ofx = [
    "OFXHEADER:100",
    "",
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20300108<TRNAMT>-9.99<FITID>S1<NAME>Streaming service</STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n");
  await sheet.getByLabel("File", { exact: true }).setInputFiles({
    name: "statement.qfx",
    mimeType: "application/vnd.intu.qfx",
    buffer: Buffer.from(ofx),
  });
  await expect(sheet).toContainText("A bank statement (statement.qfx)");
  await sheet.getByRole("button", { name: "Check import" }).click();
  await sheet.getByRole("button", { name: "Import 1 transaction" }).click();
  await expect(sheet.getByRole("status").first()).toHaveText("Imported 1 transaction");

  // Undo the CSV import from the list.
  const recent = sheet.getByRole("region", { name: "Recent imports" });
  const csvImport = recent.getByRole("listitem").filter({ hasText: "checking.csv" });
  await csvImport.getByRole("button", { name: "Undo import" }).click();
  await expect(csvImport).toContainText("Any you've edited since go too.");
  await csvImport.getByRole("button", { name: "Undo import" }).click();
  await expect(recent.getByRole("status")).toHaveText("Import undone");
  await expect(csvImport).toContainText("Undone");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(accounts.getByRole("button", { name: /Checking/ })).toContainText("-$9.99");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test("rules sort payees, and transfers stay out of spending", async ({ page }, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const book = `Rules ${id}`;
  const errors = trackErrors(page);

  const bookId = (
    await (
      await page.request.post("/api/money/books", {
        data: { name: book, kind: "personal", starterCategories: true },
      })
    ).json()
  ).id;
  for (const [name, openingBalanceCents] of [
    ["Checking", 100_000],
    ["Savings", 0],
  ] as const) {
    await page.request.post("/api/money/accounts", {
      data: { bookId, name, kind: "checking", openingBalanceCents },
    });
  }
  await page.addInitScript(
    (value) => localStorage.setItem("hub.money.book", value),
    String(bookId),
  );
  await page.goto("/money");
  await expect(page.getByText(`${book}: 2 accounts`)).toBeVisible();

  // A rule that cleans up a card processor's payee.
  await page.getByRole("button", { name: "Rules" }).click();
  const rules = page.getByRole("dialog", { name: "Rules" });
  await rules.getByLabel("Payee contains").fill("corner groc");
  await rules.getByLabel("Category").selectOption({ label: "Groceries" });
  await rules.getByLabel("Rename payee to").fill("Corner grocery");
  await rules.getByRole("button", { name: "Add rule" }).click();
  await expect(rules.getByRole("listitem")).toContainText("“corner groc” → Groceries");
  await rules.getByRole("button", { name: "Close" }).click();

  // Imports use it.
  const csv = [
    `Date,Description,Amount,Note ${id}`,
    "2030-01-05,SQ *CORNER GROC 4412,-42.50,",
    "2030-01-06,ONLINE TRANSFER TO SAV,-200.00,",
  ].join("\n");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const importing = page.getByRole("dialog", { name: "Import transactions" });
  await importing.getByLabel("Into account").selectOption({ label: "Checking" });
  await importing
    .getByLabel("File", { exact: true })
    .setInputFiles({ name: "checking.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await importing.getByRole("button", { name: "Check import" }).click();
  await expect(importing).toContainText("1 gets a category from your rules");
  await importing.getByRole("button", { name: "Import 2 transactions" }).click();
  await importing.getByRole("button", { name: "Done" }).click();

  // The savings side of the transfer, as another import would bring it in.
  const accounts = await (await page.request.get(`/api/money/accounts?bookId=${bookId}`)).json();
  const savingsId = accounts.find((account: { name: string }) => account.name === "Savings").id;
  await page.request.post("/api/money/transactions", {
    data: {
      accountId: savingsId,
      date: "2030-01-07",
      amountCents: 20_000,
      payee: "TRANSFER FROM CHK",
    },
  });
  await page.reload();

  const transactions = page.getByRole("region", { name: "Transactions" });
  await expect(transactions.getByRole("button", { name: /Corner grocery/ })).toContainText(
    "Groceries",
  );
  await expect(transactions).toContainText("1 pair looks like a transfer between your accounts.");
  await transactions.getByRole("button", { name: "Review transfers" }).click();
  const pairs = page.getByRole("dialog", { name: "Possible transfers" });
  await expect(pairs).toContainText("$200 from Checking");
  await pairs.getByRole("button", { name: "Link as transfer" }).click();
  await expect(pairs.getByRole("status")).toHaveText("Linked $200 from Checking to Savings");
  await expect(pairs).toContainText("Nothing left to review.");
  await pairs.getByRole("button", { name: "Close" }).click();
  await expect(transactions).toContainText(
    "3 transactions · $0 in · $42.50 out · 2 transfers not counted",
  );
  await expect(transactions.getByRole("button", { name: /ONLINE TRANSFER TO SAV/ })).toContainText(
    "Transfer to Savings",
  );

  // A transfer entered by hand, then unlinked.
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  let sheet = page.getByRole("dialog", { name: "Add transaction" });
  await sheet.getByRole("radio", { name: "Transfer" }).check();
  await sheet.getByLabel("Amount").fill("50");
  await sheet.getByLabel("From account").selectOption({ label: "Checking" });
  await sheet.getByLabel("To account").selectOption({ label: "Savings" });
  await sheet.getByRole("button", { name: "Add transfer" }).click();
  await expect(sheet).toBeHidden();
  const balances = page.getByRole("region", { name: "Accounts" });
  await expect(balances.getByRole("button", { name: /^Checking/ })).toContainText("$707.50");
  await expect(balances.getByRole("button", { name: /^Savings/ })).toContainText("$250");

  await transactions.getByRole("button", { name: /Transfer to Savings.*\$50/ }).click();
  sheet = page.getByRole("dialog", { name: "Transfer" });
  await expect(sheet).toContainText("$50 from Checking to Savings");
  await sheet.getByRole("button", { name: "Unlink transfer" }).click();
  await expect(sheet).toBeHidden();
  await expect(transactions).toContainText(
    "5 transactions · $50 in · $92.50 out · 2 transfers not counted",
  );

  // Typing a payee picks the rule's category.
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  sheet = page.getByRole("dialog", { name: "Add transaction" });
  await sheet.getByLabel("Paid to").fill("Corner groc downtown");
  await expect(sheet.getByText("Picked by a rule")).toBeVisible();
  await expect(sheet.getByLabel("Category").locator("option:checked")).toHaveText("Groceries");
  await sheet.getByRole("button", { name: "Close" }).click();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
