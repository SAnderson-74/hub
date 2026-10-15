import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("items to sell, pasted from the Claude Project, are added at once", async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const answer = {
    format: "hub-inventory/v1",
    items: [
      {
        title: `Phone ${id}`,
        brand: "Example",
        model: "X1",
        condition: "used",
        category: "Phones",
        purchase: { price: 40, date: "2030-01-10", from: "Garage sale" },
      },
      { title: `Laptop ${id}`, status: "repairing", notes: "Needs a new battery." },
      { title: `Tablet ${id} IMEI 356938035643809`, condition: "like new" },
    ],
  };

  await page.goto("/resale");
  await page.getByRole("button", { name: "Paste items" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Paste items" });
  await sheet
    .getByLabel("Claude Project answer")
    .fill(`Here are your items:\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``);
  await expect(sheet.getByText("taken out of 1 item")).toBeVisible();
  await expect(sheet.getByText("3 items to add, 2 flagged to review")).toBeVisible();
  await expect(sheet.getByText(`Tablet ${id}`, { exact: true })).toBeVisible();
  await sheet.getByRole("button", { name: "Add 3 items" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Added 3 items");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();

  const items: Array<{ title: string; status: string; needsReview: boolean; notes: string }> =
    await (await page.request.get("/api/resale/items")).json();
  const ours = items.filter((item) => item.title.includes(id));
  expect(ours.map((item) => [item.title, item.status, item.needsReview]).sort()).toEqual([
    [`Laptop ${id}`, "repairing", true],
    [`Phone ${id}`, "acquired", false],
    [`Tablet ${id}`, "acquired", true],
  ]);
  expect(ours.find((item) => item.title === `Phone ${id}`)?.notes).toBe(
    "Brand: Example\nModel: X1",
  );
  expect(JSON.stringify(ours)).not.toContain("356938035643809");

  // The same answer again, through Paste from Claude, adds nothing.
  await page.goto("/settings");
  await page
    .getByRole("region", { name: "Imports" })
    .getByRole("button", { name: /Paste from Claude/ })
    .click();
  const paste = page.getByRole("dialog", { name: "Paste from Claude" });
  await paste.getByLabel("Claude Project answer").fill(JSON.stringify(answer));
  await expect(paste.getByText("Items to sell, into Resale")).toBeVisible();
  await expect(paste).toContainText("3 are already in Hub and will be skipped.");
  await expect(paste.getByRole("button", { name: "Nothing to add" })).toBeDisabled();
  expect(errors).toEqual([]);
});
