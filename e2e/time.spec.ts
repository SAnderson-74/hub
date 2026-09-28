import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Whether a time falls in an earlier week than now, as the Time page counts weeks. */
function inLastWeek(page: Page, time: number): Promise<boolean> {
  return page.evaluate((at) => {
    const monday = (date: Date) => {
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      return start.getTime();
    };
    return monday(new Date(at)) < monday(new Date());
  }, time);
}

test("time can be tracked with the timer and added by hand", async ({ page }, testInfo) => {
  // One timer is shared by every test; start from a stopped one.
  await page.request.post("/api/time/timer/stop");
  const title = `Read chapter 4 ${testInfo.project.name} ${Date.now()}`;
  const task = await (await page.request.post("/api/tasks", { data: { title } })).json();
  const errors = trackErrors(page);

  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Time" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Time" })).toBeVisible();

  // Timers: two run at once, and each stops on its own.
  const timer = page.getByRole("region", { name: "Timers" });
  await timer.getByLabel("What are you working on?").fill("Focus session");
  await timer.getByLabel("For").selectOption({ label: title });
  await timer.getByRole("button", { name: "Start timer" }).click();
  await expect(timer.getByText(title)).toBeVisible();
  await timer.getByRole("button", { name: "Start another timer" }).click();
  const other = `Laundry ${testInfo.project.name}`;
  await timer.getByLabel("What are you working on?").fill(other);
  await timer.getByRole("button", { name: "Start another timer" }).click();
  await expect(timer).toContainText("2 running.");
  await timer.getByRole("button", { name: `Stop timer: ${title}` }).click();
  await expect(timer.getByText(title)).toBeHidden();
  await expect(timer.getByText(other)).toBeVisible();
  await timer.getByRole("button", { name: `Stop timer: ${other}` }).click();
  await expect(timer.getByRole("button", { name: "Start timer" })).toBeVisible();

  const entries = page.getByRole("region", { name: "Entries" });
  const timed = entries.getByRole("button", { name: new RegExp(title) });
  await expect(timed).toContainText("Focus session");
  await expect(timed).toContainText("1 min");

  // Adding time by hand; the form starts as the last 30 minutes.
  const openedAt = Date.now();
  await entries.getByRole("button", { name: "Add time" }).click();
  const add = page.getByRole("dialog", { name: "Add time" });
  // Just after midnight it adds ", ending the next day".
  await expect(add.getByText(/^30 min[.,]/)).toBeVisible();
  await add.getByLabel("Note").fill("Flashcards");
  await add.getByRole("button", { name: "Add time" }).click();
  await expect(add).toBeHidden();
  // Just after midnight on a Monday, those 30 minutes started last week.
  const movedBack = await inLastWeek(page, openedAt - 30 * 60_000);
  if (movedBack) await page.getByRole("button", { name: "Previous week" }).click();
  const manual = entries.getByRole("button", { name: /^Flashcards/ }).first();
  await expect(manual).toContainText("30 min");

  // Editing it
  await manual.click();
  const edit = page.getByRole("dialog", { name: "Edit time" });
  await edit.getByLabel("Note").fill("Flashcards, round two");
  await edit.getByRole("button", { name: "Save time" }).click();
  await expect(edit).toBeHidden();
  await expect(
    entries.getByRole("button", { name: /^Flashcards, round two/ }).first(),
  ).toBeVisible();

  if (movedBack) await page.getByRole("button", { name: "Next week" }).click();

  // The week chart's summary and the page width on phones
  await expect(page.getByRole("figure")).toContainText("this week, most on");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  // The task sheet shows the time logged on it.
  await page.goto(`/tasks?task=${task.id}`);
  const sheet = page.getByRole("dialog", { name: "Task" });
  await expect(sheet.getByText("1 min logged.")).toBeVisible();
  expect(errors).toEqual([]);
  await page.goto("/time");
  await expect(page.getByRole("figure")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("time.png"), fullPage: true });
});

test.describe("on a wide screen", () => {
  // Both browsers in CI (WebKit for the iPhone run, Chromium for desktop) at a
  // desktop width, where sheets become centered dialogs sized to their content.
  test.use({ viewport: { width: 2560, height: 1440 } });

  test("the time dialog shows its whole form", async ({ page }, testInfo) => {
    const note = `Wide screen ${testInfo.project.name} ${Date.now() % 100000}`;
    const now = Date.now();
    const created = await page.request.post("/api/time/entries", {
      data: {
        startedAt: new Date(now - 26 * 3_600_000).toISOString(),
        endedAt: new Date(now - 25 * 3_600_000).toISOString(),
        note,
      },
    });
    expect(created.status()).toBe(201);

    await page.goto("/time");
    // Early in the week, a day and a bit ago is last week: go there first.
    if (await inLastWeek(page, now - 26 * 3_600_000)) {
      await page.getByRole("button", { name: "Previous week" }).click();
    }
    await page
      .getByRole("button", { name: new RegExp(note) })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Edit time" });
    // In view, not just present: a collapsed body would clip the form away.
    await expect(dialog.getByRole("button", { name: "Save time" })).toBeInViewport();
    await expect(dialog.getByLabel("Date")).toBeInViewport();
    const height = (await dialog.boundingBox())?.height ?? 0;
    expect(height).toBeGreaterThan(300);
  });
});
