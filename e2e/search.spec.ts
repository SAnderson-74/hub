import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** The search button: in the header on phones, the sidebar on wider screens. */
const searchButton = (page: Page) =>
  page.getByRole("button", { name: "Search", exact: true }).locator("visible=true");

test("search finds a task and a transaction and opens them", async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  // Both device runs share one database, so names are unique per run.
  const id = `${testInfo.project.name}${Date.now() % 100000}`;
  const task = await page.request.post("/api/tasks", {
    data: { title: `Replace the furnace filter ${id}` },
  });
  expect(task.status()).toBe(201);
  const book = (await (
    await page.request.post("/api/money/books", {
      data: { name: `Search ${id}`, kind: "personal" },
    })
  ).json()) as { id: number };
  const account = (await (
    await page.request.post("/api/money/accounts", {
      data: { bookId: book.id, name: "Checking", kind: "checking", openingBalanceCents: 0 },
    })
  ).json()) as { id: number };
  const spent = await page.request.post("/api/money/transactions", {
    data: { accountId: account.id, date: "2030-01-15", amountCents: -4218, payee: `Market ${id}` },
  });
  expect(spent.status()).toBe(201);

  await page.goto("/");
  await searchButton(page).click();
  const menu = page.getByRole("dialog", { name: "Search and commands" });
  const box = menu.getByRole("combobox", { name: "Search or run a command" });
  await expect(box).toBeFocused();
  // Before typing: actions and pages.
  await expect(menu.getByRole("option", { name: "Add a task" })).toBeVisible();
  await expect(menu.getByRole("group", { name: "Pages" })).toBeVisible();

  await box.fill(`furnace ${id}`);
  const result = menu
    .getByRole("group", { name: "Tasks" })
    .getByRole("option", { name: new RegExp(`Replace the furnace filter ${id}`) });
  await expect(result).toBeVisible();
  await expect(result).toContainText("Inbox · To do");
  await expect(result).toHaveAttribute("aria-selected", "true");
  // The arrow keys move the highlight and wrap around.
  await box.press("ArrowDown");
  await expect(result).toHaveAttribute("aria-selected", "false");
  await box.press("ArrowUp");
  await expect(result).toHaveAttribute("aria-selected", "true");
  await box.press("Enter");
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/\/tasks\?task=\d+/);
  const sheet = page.getByRole("dialog", { name: "Task" });
  await expect(sheet.getByLabel("Title")).toHaveValue(`Replace the furnace filter ${id}`);
  await sheet.getByRole("button", { name: "Close" }).click();

  // A transaction opens in its own book, found by payee.
  await searchButton(page).click();
  await box.fill(`market ${id}`);
  const transaction = menu
    .getByRole("group", { name: "Transactions" })
    .getByRole("option", { name: new RegExp(`Market ${id}`) });
  await expect(transaction).toContainText("-$42.18");
  await transaction.click();
  await expect(page).toHaveURL(/\/money$/);
  const opened = page.getByRole("dialog", { name: "Transaction" });
  await expect(opened.getByLabel("Paid to")).toHaveValue(`Market ${id}`);
  await expect(page.getByText(new RegExp(`^Search ${id}:`))).toBeVisible();

  // Nothing found says so.
  await page.keyboard.press("Escape");
  await expect(opened).toBeHidden();
  await searchButton(page).click();
  await box.fill("zzzz nothing like this");
  await expect(menu.getByRole("status")).toContainText("Nothing matches");
  await menu.getByRole("button", { name: "Close" }).click();
  await expect(menu).toBeHidden();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test("commands run from the menu", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/goals");
  await searchButton(page).click();
  const menu = page.getByRole("dialog", { name: "Search and commands" });
  const box = menu.getByRole("combobox", { name: "Search or run a command" });
  await box.fill("new task");
  await expect(menu.getByRole("option").first()).toHaveAccessibleName("Add a task");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.locator("#new-task")).toBeFocused();

  await searchButton(page).click();
  await box.fill("start a timer");
  await menu.getByRole("option", { name: "Start a timer", exact: true }).click();
  await expect(page).toHaveURL(/\/time$/);
  await expect(page.getByLabel("What are you working on?")).toBeFocused();
  expect(errors).toEqual([]);
});

test("keyboard shortcuts open the menu and go to pages", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "iphone", "Phones have no keyboard shortcuts");
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(searchButton(page)).toBeVisible();
  const menu = page.getByRole("dialog", { name: "Search and commands" });
  await page.keyboard.press("ControlOrMeta+k");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await page.keyboard.press("/");
  await expect(menu).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(menu).toBeHidden();

  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await expect(page).toHaveURL(/\/tasks$/);
  // Not while typing.
  await page.locator("#new-task").click();
  await page.keyboard.type("gh");
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.locator("#new-task")).toHaveValue("gh");
  await page.locator("#new-task").fill("");
  await page.locator("#new-task").blur();

  await page.keyboard.press("?");
  const list = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(list).toContainText("Go to Money");
  await list.getByRole("button", { name: "Close" }).click();
  expect(errors).toEqual([]);
});
