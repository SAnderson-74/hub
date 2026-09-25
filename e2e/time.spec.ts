import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
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

  // Timer
  const timer = page.getByRole("region", { name: "Timer" });
  await timer.getByLabel("What are you working on?").fill("Focus session");
  await timer.getByLabel("For").selectOption({ label: title });
  await timer.getByRole("button", { name: "Start timer" }).click();
  await expect(timer.getByText(title)).toBeVisible();
  await timer.getByRole("button", { name: "Stop timer" }).click();
  await expect(timer.getByRole("button", { name: "Start timer" })).toBeVisible();

  const entries = page.getByRole("region", { name: "Entries" });
  const timed = entries.getByRole("button", { name: new RegExp(title) });
  await expect(timed).toContainText("Focus session");
  await expect(timed).toContainText("1 min");

  // Adding time by hand; the form starts as the last 30 minutes.
  await entries.getByRole("button", { name: "Add time" }).click();
  const add = page.getByRole("dialog", { name: "Add time" });
  await expect(add.getByText("30 min.")).toBeVisible();
  await add.getByLabel("Note").fill("Flashcards");
  await add.getByRole("button", { name: "Add time" }).click();
  await expect(add).toBeHidden();
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
