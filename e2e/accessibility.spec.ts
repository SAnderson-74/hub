import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Every page, checked with axe against WCAG 2.1 A and AA at iPhone and desktop sizes,
 * on a server of its own filled with the example data (see playwright.config.ts), so
 * lists, charts, and the sheets people open most are checked too. A failure lists
 * each rule broken and where, so the fix can start from the message.
 */
const PAGES = [
  { path: "/", heading: /^Good (morning|afternoon|evening)/ },
  { path: "/tasks", heading: "Tasks" },
  { path: "/time", heading: "Time" },
  { path: "/goals", heading: "Goals" },
  { path: "/courses", heading: "Courses" },
  { path: "/habits", heading: "Habits" },
  { path: "/resale", heading: "Resale" },
  { path: "/money", heading: "Money" },
  { path: "/tithing", heading: "Tithing" },
  { path: "/taxes", heading: "Taxes" },
  { path: "/business", heading: "Business" },
  { path: "/settings", heading: "Settings" },
  { path: "/more", heading: "More" },
] as const;

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** axe's findings as short lines: "rule (impact): what's wrong — where". */
async function violations(page: Page, include?: string): Promise<string[]> {
  const builder = new AxeBuilder({ page }).withTags(WCAG);
  if (include) builder.include(include);
  const results = await builder.analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help} — ${node.target.join(" ")}`,
    ),
  );
}

/** Waits for loading rows to give way to content. */
async function settled(page: Page) {
  await expect(page.locator('[aria-busy="true"]:visible')).toHaveCount(0);
}

/** Opens a page and waits for its heading and content. */
async function open(page: Page, path: string, heading: string | RegExp) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await settled(page);
}

/** Checks a sheet once it's open. */
async function checkSheet(page: Page, sheet: Locator) {
  await expect(sheet).toBeVisible();
  await settled(page);
  expect(await violations(page, "dialog[open]")).toEqual([]);
}

// The server starts empty; the first test to run adds the example data.
test.beforeAll(async ({ playwright }, testInfo) => {
  const request = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  const status = await (await request.get("/api/setup")).json();
  if (status.needed) {
    const res = await request.post("/api/setup", {
      data: { modules: {}, timeZone: "", demo: true },
    });
    expect(res.ok(), await res.text()).toBe(true);
  }
  await request.dispose();
});

for (const { path, heading } of PAGES) {
  test(`${path} meets WCAG 2.1 AA`, async ({ page }) => {
    await open(page, path, heading);
    expect(await violations(page)).toEqual([]);
  });
}

test("Money's views meet WCAG 2.1 AA", async ({ page }) => {
  await open(page, "/money", "Money");
  for (const view of ["Budget", "Bills", "Forecast", "Insights", "Debts", "Rewards", "Net worth"]) {
    await page.getByRole("radio", { name: view, exact: true }).check();
    await settled(page);
    expect(await violations(page), view).toEqual([]);
  }
  await page.getByRole("radio", { name: "Transactions" }).check();
});

test("the main sheets meet WCAG 2.1 AA", async ({ page }) => {
  await open(page, "/tasks", "Tasks");
  await page.getByRole("button", { name: /^Replace the smoke detector batteries/ }).click();
  await checkSheet(page, page.getByRole("dialog", { name: "Task" }));

  await open(page, "/goals", "Goals");
  await page
    .getByRole("button", { name: /Run a 10K/ })
    .first()
    .click();
  await checkSheet(page, page.getByRole("dialog", { name: "Goal" }));

  await open(page, "/courses", "Courses");
  await page
    .getByRole("region", { name: "Courses" })
    .getByRole("button", { name: /Introduction to Networks/ })
    .click();
  await checkSheet(page, page.getByRole("dialog", { name: "Course" }));

  await open(page, "/resale", "Resale");
  await page
    .getByRole("button", { name: /Road bike/ })
    .first()
    .click();
  await checkSheet(page, page.getByRole("dialog", { name: "Item" }));

  await open(page, "/money", "Money");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await checkSheet(page, page.getByRole("dialog", { name: /transaction/i }));
});

test("the command menu and shortcuts meet WCAG 2.1 AA", async ({ page }) => {
  await open(page, "/", /^Good (morning|afternoon|evening)/);
  await page.getByRole("button", { name: "Search", exact: true }).locator("visible=true").click();
  const menu = page.getByRole("dialog", { name: "Search and commands" });
  await checkSheet(page, menu);
  await menu.getByRole("combobox").fill("run");
  await expect(menu.getByRole("group", { name: "Goals" })).toBeVisible();
  await checkSheet(page, menu);
  await menu.getByRole("combobox").fill("keyboard");
  await menu.getByRole("combobox").press("Enter");
  await checkSheet(page, page.getByRole("dialog", { name: "Keyboard shortcuts" }));
});

test("templates and planning sheets meet WCAG 2.1 AA", async ({ page }) => {
  await open(page, "/tasks", "Tasks");
  await page.getByRole("button", { name: "Templates" }).click();
  await checkSheet(page, page.getByRole("dialog", { name: "Templates" }));
  await page.keyboard.press("Escape");

  await open(page, "/tasks?list=today", "Tasks");
  await page.getByRole("button", { name: "Plan the day" }).click();
  await checkSheet(page, page.getByRole("dialog", { name: "Plan the day" }));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Shut down" }).click();
  await checkSheet(page, page.getByRole("dialog", { name: "Shut down for the day" }));
});

test("budget options and money owed back meet WCAG 2.1 AA", async ({ page }) => {
  await open(page, "/money", "Money");
  await page.getByRole("radio", { name: "Budget", exact: true }).check();
  await settled(page);
  await page.getByRole("button", { name: /^Options for Insurance/ }).click();
  await checkSheet(page, page.getByRole("dialog", { name: "Carry over and save up" }));
  await page.keyboard.press("Escape");

  await page.getByRole("radio", { name: "Transactions", exact: true }).check();
  await expect(page.getByRole("region", { name: "Owed to you" })).toBeVisible();
  await page
    .getByRole("region", { name: "Transactions" })
    .getByRole("button", { name: /Example Tickets/ })
    .click();
  const sheet = page.getByRole("dialog", { name: "Transaction" });
  await expect(sheet.getByText("Not paid back yet")).toBeVisible();
  await sheet.getByRole("button", { name: "Someone owes me part of this" }).click();
  await checkSheet(page, sheet);
});

test("the habit sheet meets WCAG 2.1 AA", async ({ page }) => {
  await open(page, "/habits", "Habits");
  await page
    .getByRole("region", { name: "All habits" })
    .getByRole("button", { name: /^Read 20 pages(?!:)/ })
    .click();
  await checkSheet(page, page.getByRole("dialog", { name: "Habit" }));
});
