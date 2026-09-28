import { expect, test } from "@playwright/test";

test("every import opens from Settings", async ({ page }, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const book = `Settings imports ${id}`;
  const created = await page.request.post("/api/money/books", {
    data: { name: book, kind: "personal" },
  });
  const bookId = (await created.json()).id;
  const account = await page.request.post("/api/money/accounts", {
    data: { bookId, name: "Checking", kind: "checking" },
  });
  expect(account.status()).toBe(201);

  await page.goto("/settings");
  const panel = page.getByRole("region", { name: "Imports" });
  // Other tests' books share this database, so pick this one.
  await panel.getByLabel("Book").selectOption({ label: book });
  await panel.getByRole("button", { name: /^Bank or card transactions/ }).click();

  const ofx = [
    "OFXHEADER:100",
    "",
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20300105<TRNAMT>-42.50<FITID>A1<NAME>CORNER GROCERY</STMTTRN>",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n");
  const sheet = page.getByRole("dialog", { name: "Import transactions" });
  await sheet.getByLabel("File", { exact: true }).setInputFiles({
    name: "statement.ofx",
    mimeType: "application/x-ofx",
    buffer: Buffer.from(ofx),
  });
  await sheet.getByRole("button", { name: "Check import" }).click();
  await sheet.getByRole("button", { name: "Import 1 transaction" }).click();
  await expect(sheet.getByRole("status").first()).toHaveText("Imported 1 transaction");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();

  const transactions = await page.request.get(`/api/money/transactions?bookId=${bookId}`);
  expect(JSON.stringify(await transactions.json())).toContain("CORNER GROCERY");

  // The others open the same sheets as on their own pages.
  for (const [row, dialog] of [
    [/^Resale items/, "Import from a spreadsheet"],
    [/^Resale listing/, "Paste a listing"],
    [/^Study plan/, "Import a study plan"],
  ] as const) {
    await panel.getByRole("button", { name: row }).click();
    const opened = page.getByRole("dialog", { name: dialog });
    await expect(opened).toBeVisible();
    await opened.getByRole("button", { name: "Close" }).click();
    await expect(opened).toBeHidden();
  }
});
