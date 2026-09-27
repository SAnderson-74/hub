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

test("budgets carry forward and show what's left", async ({ page }, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const book = `Budget ${id}`;
  const errors = trackErrors(page);
  // The browser and this test both run in UTC, so "this month" agrees.
  const month = new Date().toISOString().slice(0, 7);

  const bookId = (
    await (
      await page.request.post("/api/money/books", {
        data: { name: book, kind: "personal", starterCategories: true },
      })
    ).json()
  ).id;
  const accountId = (
    await (
      await page.request.post("/api/money/accounts", {
        data: { bookId, name: "Checking", kind: "checking" },
      })
    ).json()
  ).id;
  const categories = await (
    await page.request.get(`/api/money/categories?bookId=${bookId}`)
  ).json();
  const categoryId = (name: string) =>
    categories.find((category: { name: string }) => category.name === name).id;
  for (const [amountCents, name] of [
    [-8_732, "Groceries"],
    [-4_500, "Dining out"],
  ] as const) {
    await page.request.post("/api/money/transactions", {
      data: {
        accountId,
        date: `${month}-01`,
        amountCents,
        payee: name,
        categoryId: categoryId(name),
      },
    });
  }

  await page.addInitScript((value) => {
    localStorage.setItem("hub.money.book", value);
    localStorage.removeItem("hub.money.view");
  }, String(bookId));
  await page.goto("/money");
  await page.getByRole("radio", { name: "Budget", exact: true }).check();
  const categoriesPanel = page.getByRole("region", { name: "Categories" });
  await expect(categoriesPanel).toContainText("No budgets for");

  const groceries = categoriesPanel.getByRole("listitem").filter({ hasText: "Groceries" });
  await groceries.getByRole("button", { name: "Set budget for Groceries" }).click();
  await groceries.getByLabel("Monthly budget for Groceries").fill("20x");
  await groceries.getByRole("button", { name: "Save budget" }).click();
  await expect(groceries).toContainText("Use an amount like 250 or 99.50.");
  await groceries.getByLabel("Monthly budget for Groceries").fill("200");
  await groceries.getByRole("button", { name: "Save budget" }).click();
  await expect(categoriesPanel.getByRole("status")).toHaveText("Budget saved for Groceries");
  const budgeted = categoriesPanel.getByRole("listitem").filter({ hasText: "Groceries" });
  await expect(budgeted).toContainText("$87.32 of $200");
  await expect(budgeted).toContainText("$112.68 left");

  const dining = categoriesPanel.getByRole("listitem").filter({ hasText: "Dining out" });
  await dining.getByRole("button", { name: "Set budget for Dining out" }).click();
  await dining.getByLabel("Monthly budget for Dining out").fill("30");
  await dining.getByRole("button", { name: "Save budget" }).click();
  await expect(
    categoriesPanel.getByRole("listitem").filter({ hasText: "Dining out" }),
  ).toContainText("$15 over");

  const overview = page.getByRole("region", { name: "Overview" });
  await expect(overview).toContainText("Budgeted$230");
  await expect(overview).toContainText("Spent$132.32");
  await expect(overview).toContainText("Left$97.68");

  // The chart's numbers, and budgets carrying forward but not back.
  const history = page.getByRole("region", { name: "Last 6 months" });
  await history.getByText("Show the numbers").click();
  await expect(history.getByRole("table")).toContainText("$230");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(overview).toContainText("Budgeted$230");
  await expect(overview).toContainText("Spent$0");
  await page.getByRole("button", { name: "Back to this month" }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(categoriesPanel).toContainText("No budgets for");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test("balances from statements, and savings goals that follow an account", async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const book = `Savings ${id}`;
  const errors = trackErrors(page);
  const today = new Date().toISOString().slice(0, 10);

  const bookId = (
    await (
      await page.request.post("/api/money/books", { data: { name: book, kind: "personal" } })
    ).json()
  ).id;
  const account = async (name: string, kind: string, openingBalanceCents: number) =>
    (
      await (
        await page.request.post("/api/money/accounts", {
          data: { bookId, name: `${name} ${id}`, kind, openingBalanceCents },
        })
      ).json()
    ).id as number;
  const savingsId = await account("Rainy day", "savings", 250_000);
  await account("Retirement", "investment", 0);

  // A balance from a statement, for an account that isn't imported.
  await page.addInitScript((value) => {
    localStorage.setItem("hub.money.book", value);
    localStorage.setItem("hub.money.view", "transactions");
  }, String(bookId));
  await page.goto("/money");
  const accounts = page.getByRole("region", { name: "Accounts" });
  await accounts.getByRole("button", { name: new RegExp(`^Retirement ${id}`) }).click();
  const sheet = page.getByRole("dialog", { name: "Account" });
  const history = sheet.getByRole("region", { name: "Balance history" });
  await expect(history).toContainText("No balances entered yet.");
  await history.getByLabel("Balance", { exact: true }).fill("41,250.75");
  await history.getByLabel("Note").fill("Quarterly statement");
  await history.getByRole("button", { name: "Save balance" }).click();
  await expect(history.getByRole("status")).toContainText("Balance saved");
  await expect(history.getByRole("listitem")).toContainText("$41,250.75");
  await expect(sheet).toContainText("From the $41,250.75 balance on");
  await expect(sheet.getByRole("button", { name: "Delete account" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(
    accounts.getByRole("button", { name: new RegExp(`^Retirement ${id}`) }),
  ).toContainText("Balance from");

  // A savings goal linked to the savings account follows its balance.
  const goalTitle = `Emergency fund ${id}`;
  const goal = await page.request.post("/api/goals", {
    data: { title: goalTitle, progressMode: "amount", targetCents: 1_000_000 },
  });
  expect(goal.status()).toBe(201);
  await page.goto("/goals");
  await page.getByRole("radio", { name: "Goals" }).check();
  await page.getByRole("button", { name: new RegExp(`^${goalTitle}`) }).click();
  const goalSheet = page.getByRole("dialog", { name: "Goal" });
  await goalSheet.getByRole("checkbox", { name: new RegExp(`Rainy day ${id}`) }).check();
  await expect(goalSheet).toContainText("Saved so far: $2,500, the chosen accounts' balance.");
  await expect(goalSheet.getByLabel("Saved so far")).toHaveCount(0);
  await goalSheet.getByRole("button", { name: "Save goal" }).click();
  await expect(goalSheet.getByRole("status")).toHaveText("Goal saved");
  await goalSheet.getByRole("button", { name: "Close" }).click();
  const card = page.getByRole("button", { name: new RegExp(`^${goalTitle}`) });
  await expect(card).toContainText(`$2,500 of $10,000 in Rainy day ${id}`);
  await expect(card).toContainText("25%");

  // Money arriving in the account moves the goal.
  await page.request.post("/api/money/transactions", {
    data: { accountId: savingsId, date: today, amountCents: 50_000, payee: "Deposit" },
  });
  await page.reload();
  await page.getByRole("radio", { name: "Goals" }).check();
  await expect(card).toContainText("$3,000 of $10,000");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test("net worth adds up every account over time", async ({ page }, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const book = `Worth ${id}`;
  const errors = trackErrors(page);
  const today = new Date().toISOString().slice(0, 10);
  const earlier = new Date();
  earlier.setDate(15);
  earlier.setMonth(earlier.getMonth() - 2);

  const newBook = async (name: string) =>
    (
      await (
        await page.request.post("/api/money/books", { data: { name, kind: "personal" } })
      ).json()
    ).id as number;
  const account = async (bookId: number, name: string, kind: string, openingBalanceCents: number) =>
    (
      await (
        await page.request.post("/api/money/accounts", {
          data: { bookId, name: `${name} ${id}`, kind, openingBalanceCents },
        })
      ).json()
    ).id as number;
  const bookId = await newBook(book);
  const checking = await account(bookId, "Checking", "checking", 100_000);
  await account(bookId, "Car loan", "loan", -25_000);
  await account(await newBook(`Other ${id}`), "Side savings", "savings", 5_000);
  const add = (date: string, amountCents: number) =>
    page.request.post("/api/money/transactions", {
      data: { accountId: checking, date, amountCents, payee: "Pay" },
    });
  await add(earlier.toISOString().slice(0, 10), 50_000);
  await add(today, -10_000);

  await page.addInitScript((value) => {
    localStorage.setItem("hub.money.book", value);
    localStorage.setItem("hub.money.view", "net-worth");
    localStorage.setItem("hub.money.netWorth.scope", "book");
  }, String(bookId));
  await page.goto("/money");
  await expect(page.getByRole("radio", { name: "Net worth" })).toBeChecked();
  await expect(page.getByRole("radio", { name: `${book} only` })).toBeChecked();

  await expect(page.locator("figcaption")).toHaveText(
    /^Net worth is \$1,150, down \$100 since the end of \w{3} \d{4}\.$/,
  );
  const where = page.getByRole("region", { name: "Assets" });
  await expect(where).toContainText(`Checking ${id}`);
  await expect(where).toContainText("$1,400");
  await expect(page.getByRole("region", { name: "Debts" })).toContainText("$250");
  await expect(where).not.toContainText(`Side savings ${id}`);

  await page.getByText("Show the numbers").click();
  await expect(page.getByRole("row", { name: /^Today/ })).toContainText("$1,150");

  // Every book, over a longer range.
  await page.getByRole("radio", { name: "3 years" }).check();
  await page.getByRole("radio", { name: "All books" }).check();
  await expect(where).toContainText(`Side savings ${id}`);
  await expect(where).toContainText(`Other ${id}`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
