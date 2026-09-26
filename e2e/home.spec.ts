import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** A local date some days from now, as the app's date fields expect. */
function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test("home shows today's tasks and the next milestones", async ({ page }, testInfo) => {
  // Both device runs share one database, so titles are unique per run.
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  for (const data of [
    { title: `Water plants ${id}`, dueDate: day(0) },
    { title: `Plan trip ${id}`, dueDate: day(1) },
  ]) {
    expect((await page.request.post("/api/tasks", { data })).status()).toBe(201);
  }
  // Home lists only the soonest milestones, so retire this test's goals from earlier runs.
  const earlier = (await (await page.request.get("/api/goals")).json()) as Array<{
    id: number;
    title: string;
    status: string;
  }>;
  for (const goal of earlier) {
    if (goal.title.startsWith("Run a 10K ") && goal.status === "active") {
      await page.request.patch(`/api/goals/${goal.id}`, { data: { status: "achieved" } });
    }
  }
  const goalRes = await page.request.post("/api/goals", { data: { title: `Run a 10K ${id}` } });
  const goal = (await goalRes.json()) as { id: number };
  const milestone = await page.request.post(`/api/goals/${goal.id}/milestones`, {
    data: { title: `Run 5K ${id}`, targetDate: day(3) },
  });
  expect(milestone.ok()).toBe(true);

  await page.goto("/");
  const today = page.getByRole("region", { name: "Today" });
  await expect(today.getByRole("link", { name: new RegExp(`Water plants ${id}`) })).toContainText(
    "Due today",
  );
  await expect(today.getByText(`Plan trip ${id}`)).toHaveCount(0);

  // Ticking a task off keeps it in view, crossed out, and counts it.
  await today.getByRole("checkbox", { name: `Water plants ${id}` }).check();
  await expect(today.getByRole("checkbox", { name: `Water plants ${id}` })).toBeChecked();
  await expect(today).toContainText(/\d+ done today\./);

  await expect(page.getByRole("region", { name: "Study streak" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Term progress" })).toBeVisible();

  const milestones = page.getByRole("region", { name: "Next milestones" });
  const link = milestones.getByRole("link", { name: new RegExp(`Run 5K ${id}`) });
  await expect(link).toContainText(`Run a 10K ${id}`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  await link.click();
  await expect(page.getByRole("dialog", { name: "Goal" }).getByLabel("Title")).toHaveValue(
    `Run a 10K ${id}`,
  );
  expect(errors).toEqual([]);
});
