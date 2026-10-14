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

test("a task saved as a template is reused with its checklist", async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  // Both device runs share one database, so names are unique per run.
  const id = `${testInfo.project.name}${Date.now() % 100000}`;
  const res = await page.request.post("/api/tasks", {
    data: { title: `List an item ${id}`, dueDate: day(2) },
  });
  const listing = (await res.json()) as { id: number };
  for (const title of ["Take photos", "Write the description"]) {
    await page.request.post("/api/tasks", { data: { title, parentId: listing.id } });
  }

  await page.goto(`/tasks?task=${listing.id}`);
  const sheet = page.getByRole("dialog", { name: "Task" });
  await sheet.getByText("Save as template").click();
  await sheet.getByLabel("Template name").fill(`Listing ${id}`);
  await sheet.getByRole("button", { name: "Save template" }).click();
  await expect(sheet.getByRole("status").filter({ hasText: "Template saved" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Templates" }).click();
  const templates = page.getByRole("dialog", { name: "Templates" });
  const row = templates.getByRole("listitem").filter({ hasText: `Listing ${id}` });
  await expect(row).toContainText("3 tasks");
  await row.getByRole("button", { name: "Use template" }).click();
  await row.getByLabel("Count due dates from").fill(day(7));
  await row.getByRole("button", { name: "Add tasks" }).click();
  await expect(templates.getByRole("status")).toContainText(`1 task added from “Listing ${id}”.`);
  await templates.getByRole("button", { name: "Close" }).click();

  // The original and the copy, the copy due a week out with its checklist.
  const copies = page.getByRole("button", { name: new RegExp(`List an item ${id}`) });
  await expect(copies).toHaveCount(2);
  await expect(copies.filter({ hasText: "0 of 2" })).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("plan the day against the hours there are, then shut down", async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  const id = `${testInfo.project.name}${Date.now() % 100000}`;
  for (const data of [
    { title: `Write the report ${id}`, dueDate: day(0), estimateMinutes: 120 },
    { title: `Call the bank ${id}`, dueDate: day(0) },
    { title: `Sort the photos ${id}` },
  ]) {
    expect((await page.request.post("/api/tasks", { data })).status()).toBe(201);
  }

  await page.goto("/tasks?list=today");
  await page.getByRole("button", { name: "Plan the day" }).click();
  const plan = page.getByRole("dialog", { name: "Plan the day" });
  await expect(plan.getByText(/^Planned \d/)).toBeVisible();
  await plan.getByLabel(`Estimate for Call the bank ${id}`).selectOption({ label: "30 min" });
  await expect(plan.getByRole("status")).toContainText(`Estimate saved: Call the bank ${id}`);

  // Pull a task in, and push one out.
  const more = plan.getByRole("button", { name: /^Show \d+ more$/ });
  if (await more.isVisible()) await more.click();
  await plan.getByRole("button", { name: `Add Sort the photos ${id} to today` }).click();
  await expect(plan.getByLabel(`Estimate for Sort the photos ${id}`)).toBeVisible();
  await plan.getByRole("button", { name: `Move Write the report ${id} to tomorrow` }).click();
  await expect(plan.getByRole("status")).toContainText(`Moved to tomorrow: Write the report ${id}`);
  await expect(
    plan.getByRole("region", { name: "Today", exact: true }).getByText(`Write the report ${id}`),
  ).toHaveCount(0);
  await plan.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Shut down" }).click();
  const shutdown = page.getByRole("dialog", { name: "Shut down for the day" });
  await shutdown.getByRole("button", { name: `Move Call the bank ${id} to tomorrow` }).click();
  await expect(shutdown.getByRole("status")).toContainText(
    `Moved to tomorrow: Call the bank ${id}`,
  );
  await shutdown.getByRole("link", { name: "Log time" }).click();
  await expect(page).toHaveURL(/\/time$/);
  await expect(page.getByRole("dialog").first()).toBeVisible();

  await page.goto("/tasks?list=upcoming");
  await expect(page.getByText(`Call the bank ${id}`)).toBeVisible();
  await expect(page.getByText(`Write the report ${id}`)).toBeVisible();
  expect(errors).toEqual([]);
});
