import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Today in Hub's time zone, which the calendar goes by. */
async function serverToday(page: Page): Promise<string> {
  const res = await page.request.get("/api/planner/calendar?from=2030-01-01&to=2030-01-02");
  return (await res.json()).today;
}

async function openFromNav(page: Page, isPhone: boolean, label: string) {
  const nav = page.getByRole("navigation", { name: "Main" });
  if (isPhone) {
    await nav.getByRole("link", { name: "More" }).click();
    await page
      .getByRole("navigation", { name: "More pages" })
      .getByRole("link", { name: label })
      .click();
  } else {
    await nav.getByRole("link", { name: label }).click();
  }
}

test("the calendar shows what's dated, by month, and opens each thing", async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const title = `Renew the lease ${id}`;
  const errors = trackErrors(page);
  const today = await serverToday(page);
  const made = await page.request.post("/api/tasks", { data: { title, dueDate: today } });
  expect(made.status()).toBe(201);
  const task = (await made.json()) as { id: number };

  await page.goto("/");
  await openFromNav(page, testInfo.project.name === "iphone", "Calendar");
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();

  // Today's cell counts it; picking the day lists only that day.
  const days = page.getByRole("list", { name: /^Days in / });
  const todayCell = days.getByRole("button", { name: /\(today\): \d+ things?$/ });
  await expect(todayCell).toBeVisible();
  await todayCell.click();
  await expect(todayCell).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Show the month" })).toBeVisible();
  const link = page.getByRole("link", { name: new RegExp(title) });
  await expect(link).toContainText("Task");

  // Months move, and come back.
  const heading = page.getByRole("heading", { level: 2 }).first();
  const thisMonth = await heading.textContent();
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(heading).not.toHaveText(thisMonth ?? "");
  await page.getByRole("button", { name: "Back to this month" }).click();
  await expect(heading).toHaveText(thisMonth ?? "");

  // The whole month lists it too, and it opens in Tasks.
  await link.click();
  await expect(page).toHaveURL(/\/tasks/);
  await expect(page.getByRole("dialog", { name: "Task" }).getByLabel("Title")).toHaveValue(title);
  // Home's Today list is short and shared with other tests; leave it as it was.
  await page.request.delete(`/api/tasks/${task.id}`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});

test("the weekly review counts what needs a look and ticks off steps", async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const late = await page.request.post("/api/tasks", {
    data: { title: `Send the form ${id}`, dueDate: "2020-01-01" },
  });
  const lateTask = (await late.json()) as { id: number };

  await page.goto("/");
  await openFromNav(page, testInfo.project.name === "iphone", "Review");
  await expect(page.getByRole("heading", { level: 1, name: "Weekly review" })).toBeVisible();
  // Both device runs share a week; start from an open review with the step unticked.
  const reopen = page.getByRole("button", { name: "Reopen review" });
  const finish = page.getByRole("button", { name: "Finish review" });
  await expect(reopen.or(finish)).toBeVisible();
  if (await reopen.isVisible()) await reopen.click();
  await expect(finish).toBeVisible();
  const time = page.getByRole("checkbox", { name: "Look back at your time" });
  await time.uncheck();

  const steps = page.getByRole("region", { name: "Steps" });
  const overdue = steps.getByRole("listitem").filter({ hasText: "Deal with overdue tasks" });
  await expect(overdue).toContainText(/\d+ tasks? past due/);
  await expect(overdue.getByRole("link", { name: "Open Today" })).toHaveAttribute(
    "href",
    "/tasks?list=today",
  );

  await time.check();
  await page.reload();
  await expect(time).toBeChecked();

  await finish.click();
  await expect(page.getByRole("status").filter({ hasText: "Review finished" })).toBeVisible();
  await reopen.click();
  await expect(finish).toBeVisible();

  // The link goes to the place to fix it.
  await overdue.getByRole("link", { name: "Open Today" }).click();
  await expect(page).toHaveURL(/\/tasks\?list=today/);
  await page.request.delete(`/api/tasks/${lateTask.id}`);
  expect(errors).toEqual([]);
});

test("a deleted task can be undone for a few seconds, then it's gone", async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const title = `Return the drill ${id}`;
  const errors = trackErrors(page);
  const made = await page.request.post("/api/tasks", { data: { title } });
  const task = (await made.json()) as { id: number };

  await page.goto(`/tasks?task=${task.id}`);
  const sheet = page.getByRole("dialog", { name: "Task" });
  await sheet.getByRole("button", { name: "Delete task" }).click();
  await expect(sheet).toBeHidden();
  const row = page.getByRole("button", { name: new RegExp(`^${title}`) });
  await expect(row).toBeHidden();
  const bar = page.getByRole("status").filter({ hasText: `Deleted ${title}` });
  await expect(bar).toBeVisible();

  await bar.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Restored ${title}` })).toBeVisible();
  await expect(row.first()).toBeVisible();
  expect((await page.request.get(`/api/tasks/${task.id}`)).status()).toBe(200);

  // Again, without undoing: the delete goes out after the wait.
  await row.first().click();
  await sheet.getByRole("button", { name: "Delete task" }).click();
  await expect(bar).toBeVisible();
  // The wait holds while the pointer is over the bar; move it away.
  await page.mouse.move(0, 0);
  await expect
    .poll(async () => (await page.request.get(`/api/tasks/${task.id}`)).status(), {
      timeout: 15_000,
    })
    .toBe(404);
  await expect(bar).toBeHidden();
  expect(errors).toEqual([]);
});

test("a deleted resale item comes back with Undo", async ({ page }, testInfo) => {
  const title = `Desk fan ${testInfo.project.name} ${Date.now() % 100000}`;
  const made = await page.request.post("/api/resale/items", { data: { title } });
  const item = (await made.json()) as { id: number };

  await page.goto(`/resale?item=${item.id}`);
  const sheet = page.getByRole("dialog", { name: "Item" });
  await sheet.getByRole("button", { name: "Delete item" }).click();
  await expect(sheet).toBeHidden();
  const card = page.getByRole("button", { name: new RegExp(title) });
  await expect(card).toBeHidden();
  // Ctrl+Z works too.
  await page.keyboard.press("Control+z");
  await expect(card).toBeVisible();
  expect((await page.request.get(`/api/resale/items/${item.id}`)).status()).toBe(200);
});
