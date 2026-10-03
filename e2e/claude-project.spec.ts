import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("one Claude Project: copy its instructions, then paste any answer", async ({
  page,
  context,
  browserName,
}, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const post = async (url: string, data: object) => {
    const res = await page.request.post(url, { data });
    expect(res.ok()).toBe(true);
    return res.json();
  };
  const book = await post("/api/money/books", {
    name: `Claude ${id}`,
    kind: "personal",
    starterCategories: true,
  });
  await post("/api/money/accounts", { bookId: book.id, name: "Checking", kind: "checking" });
  await page.addInitScript(
    (value) => localStorage.setItem("hub.money.book", value),
    String(book.id),
  );
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }

  // The instructions, to copy into the Project.
  await page.goto("/settings");
  const panel = page.getByRole("region", { name: "Claude Project" });
  await expect(panel.getByLabel(/Instructions, version \d+/)).toHaveValue(
    /^Hub import instructions, version \d+\./,
  );
  await panel.getByRole("button", { name: "Copy instructions" }).click();
  if (browserName === "chromium") {
    await expect(panel.getByRole("status")).toHaveText("Instructions copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('RECEIPTS (format "hub-receipt/v1")');
  } else {
    // Some browsers don't allow it; then the text is selected to copy by hand.
    await expect(panel.getByText(/Instructions copied|didn't allow copying/)).toBeVisible();
  }

  // One paste box: it finds where each answer goes.
  const imports = page.getByRole("region", { name: "Imports" });
  await imports.getByRole("button", { name: /Paste from Claude/ }).click();
  let sheet = page.getByRole("dialog", { name: "Paste from Claude" });
  const paste = sheet.getByLabel("Claude Project answer");
  await paste.fill('```json\n{ "format": "hub-example/v9" }\n```');
  await expect(sheet.getByText('Hub doesn\'t take "hub-example/v9" yet.')).toBeVisible();

  const date = new Date().toISOString().slice(0, 10);
  const receipts = {
    format: "hub-receipt/v1",
    receipts: [{ store: `Corner bakery ${id}`, date, total: 8.5, category: "Groceries" }],
  };
  await paste.fill(`Here's the receipt:\n\n\`\`\`json\n${JSON.stringify(receipts)}\n\`\`\``);
  await expect(sheet.getByText("Receipts, into Money")).toBeVisible();
  await sheet
    .getByLabel("Receipts without a known card were paid from")
    .selectOption({ label: "Checking" });
  await expect(sheet.getByText("Adds a new transaction to Checking")).toBeVisible();
  await sheet.getByRole("button", { name: "Add 1 receipt" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Added 1 receipt");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();

  const plan = {
    format: "hub-education/v1",
    terms: [
      {
        name: `Pasted term ${id}`,
        startDate: "2030-01-01",
        endDate: "2030-06-30",
        courses: [{ code: `PST${Date.now() % 1000}`, title: "Pasted course", credits: 3 }],
      },
    ],
  };
  await imports.getByRole("button", { name: /Paste from Claude/ }).click();
  sheet = page.getByRole("dialog", { name: "Paste from Claude" });
  await sheet.getByLabel("Claude Project answer").fill(JSON.stringify(plan));
  await expect(sheet.getByText("Study plan, into Courses")).toBeVisible();
  await sheet.getByRole("button", { name: "Check file" }).click();
  await expect(sheet).toContainText("1 new term");
  await sheet.getByRole("button", { name: "Import plan" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Plan imported");
  await sheet.getByRole("button", { name: "Done" }).click();

  // Both landed where they belong.
  await page.goto("/money");
  await expect(page.getByText(`Corner bakery ${id}`)).toBeVisible();
  const terms: Array<{ name: string }> = await (
    await page.request.get("/api/education/terms")
  ).json();
  expect(terms.map((term) => term.name)).toContain(`Pasted term ${id}`);
  expect(errors).toEqual([]);
});
