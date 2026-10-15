import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** A local date some days from now, as the date inputs expect. */
function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test("goals track progress and show on the timeline", async ({ page }, testInfo) => {
  const suffix = `${testInfo.project.name} ${Date.now()}`;
  const title = `Run a 10K ${suffix}`;
  const taskTitle = `Buy running shoes ${suffix}`;
  await page.request.post("/api/tasks", { data: { title: taskTitle } });
  const errors = trackErrors(page);

  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Goals" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Goals" })).toBeVisible();
  await page.getByRole("radio", { name: "Goals" }).check();

  // Create, then fill in the goal sheet.
  await page.getByRole("button", { name: "New goal" }).click();
  const create = page.getByRole("dialog", { name: "New goal" });
  await create.getByLabel("Title").fill(title);
  await create.getByLabel("Target date (optional)").fill(daysFromNow(60));
  await create.getByRole("button", { name: "Create goal" }).click();

  const sheet = page.getByRole("dialog", { name: "Goal" });
  await expect(sheet.getByLabel("Title")).toHaveValue(title);
  await sheet.getByLabel("New milestone", { exact: true }).fill("Run 3K");
  await sheet.getByLabel("New milestone target date").fill(daysFromNow(10));
  await sheet.getByRole("button", { name: "Add milestone" }).click();
  await sheet.getByLabel("New milestone", { exact: true }).fill("Run 5K");
  await sheet.getByRole("button", { name: "Add milestone" }).click();
  await sheet.getByRole("checkbox", { name: "Run 3K" }).check();
  await expect(sheet.getByText("1 of 2 milestones")).toBeVisible();

  // Measure by an amount instead.
  await sheet.getByLabel("Measure progress by").selectOption({ label: "An amount of money" });
  await sheet.getByLabel("Saved so far").fill("1,250");
  await sheet.getByLabel("Target", { exact: true }).fill("5000");
  await sheet.getByRole("button", { name: "Save goal" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Goal saved");
  await expect(sheet.getByText("$1,250 of $5,000")).toBeVisible();

  // Link a task.
  await sheet.getByLabel("Task to link").selectOption({ label: taskTitle });
  await sheet.getByRole("button", { name: "Link task" }).click();
  await expect(sheet.getByRole("button", { name: `Unlink ${taskTitle}` })).toBeVisible();

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  const card = page.getByRole("button", { name: new RegExp(`^${title}`) });
  await expect(card).toContainText("25%");
  await expect(card).toContainText("Next: Run 5K");

  // The timeline lists the dated milestone and goal around today.
  await page.getByRole("radio", { name: "Timeline" }).check();
  await expect(page.getByText(/^Today is /)).toBeVisible();
  const milestone = page.getByRole("button", {
    name: new RegExp(`^Run 3K Milestone for ${title}`),
  });
  await expect(milestone).toContainText("Done");
  await expect(page.getByRole("button", { name: new RegExp(`^${title} Goal`) })).toContainText(
    "Upcoming",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  // The timeline opens the goal, and the back gesture closes it.
  await milestone.click();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  expect(errors).toEqual([]);
});

test("check-ins note progress, and the pace says what each week needs", async ({
  page,
}, testInfo) => {
  const title = `Emergency fund ${testInfo.project.name} ${Date.now()}`;
  const errors = trackErrors(page);
  const made = await page.request.post("/api/goals", {
    data: {
      title,
      targetDate: daysFromNow(70),
      progressMode: "amount",
      targetCents: 500_000,
      currentCents: 100_000,
    },
  });
  expect(made.status()).toBe(201);
  const goal = (await made.json()) as { id: number };

  await page.goto(`/goals?goal=${goal.id}`);
  const sheet = page.getByRole("dialog", { name: "Goal" });
  const pace = sheet.getByRole("region", { name: "Pace" });
  // Added today, so it's too soon for a pace, but not for what's needed: $4,000 in 10 weeks.
  await expect(pace).toContainText("Too early to tell");
  await expect(pace).toContainText("Needs about $400 a week to finish by");

  await pace.getByLabel("Check-in note").fill("Set up an automatic transfer");
  await pace.getByRole("button", { name: "Check in" }).click();
  await expect(pace.getByRole("status")).toHaveText("Checked in at 20%");
  const checkins = pace.getByRole("list", { name: "Check-ins" });
  await expect(checkins).toContainText(/\w{3}, \w{3} \d+ · 20%/);
  await expect(checkins).toContainText("Set up an automatic transfer");
  await expect(pace.getByLabel("Check-in note")).toHaveValue("");

  await checkins.getByRole("button", { name: /^Delete the check-in from / }).click();
  await expect(checkins).toBeHidden();
  expect(errors).toEqual([]);
});
