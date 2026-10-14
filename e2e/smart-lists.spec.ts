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

test("Today, Upcoming, Anytime, and Someday sort tasks by when they matter", async ({
  page,
}, testInfo) => {
  const errors = trackErrors(page);
  // Both device runs share one database, so titles are unique per run.
  const id = `${testInfo.project.name}${Date.now() % 100000}`;
  const add = async (data: Record<string, unknown>) => {
    const res = await page.request.post("/api/tasks", { data });
    expect(res.status()).toBe(201);
    return (await res.json()) as { id: number };
  };
  const quote = await add({ title: `Get a quote ${id}`, startDate: day(3) });
  await add({ title: `Take out the trash ${id}`, dueDate: day(0), evening: true });
  await add({ title: `Fix the sink ${id}`, dueDate: day(0), waitingOn: [quote.id] });
  await add({ title: `Learn the banjo ${id}`, someday: true });

  await page.goto("/tasks?list=today");
  const evening = page.getByRole("region", { name: /^This evening/ });
  await expect(evening.getByText(`Take out the trash ${id}`)).toBeVisible();
  // Waiting on an open task keeps it out of Today; not started keeps the quote out.
  await expect(page.getByText(`Fix the sink ${id}`)).toHaveCount(0);
  await expect(page.getByText(`Get a quote ${id}`)).toHaveCount(0);

  await page.getByRole("radio", { name: "Upcoming" }).check();
  await expect(page).toHaveURL(/list=upcoming/);
  await expect(page.getByRole("button", { name: new RegExp(`Get a quote ${id}`) })).toContainText(
    "Starts",
  );

  await page.getByRole("radio", { name: "Anytime" }).check();
  const sink = page.getByRole("button", { name: new RegExp(`Fix the sink ${id}`) });
  await expect(sink).toContainText(`Waiting on Get a quote ${id}`);
  await expect(page.getByText(`Learn the banjo ${id}`)).toHaveCount(0);

  await page.getByRole("radio", { name: "Someday" }).check();
  await expect(page.getByText(`Learn the banjo ${id}`)).toBeVisible();

  // Stop waiting, and the sink is back in Today.
  await page.getByRole("radio", { name: "Anytime" }).check();
  await sink.click();
  const sheet = page.getByRole("dialog", { name: "Task" });
  await sheet.getByRole("button", { name: `Stop waiting on Get a quote ${id}` }).click();
  await sheet.getByRole("button", { name: "Save task" }).click();
  await expect(sheet.getByRole("status")).toContainText("Task saved");
  await sheet.getByRole("button", { name: "Close" }).click();
  await page.getByRole("radio", { name: "Today" }).check();
  await expect(
    page.getByRole("region", { name: /^Today/ }).getByText(`Fix the sink ${id}`),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
