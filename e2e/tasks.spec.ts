import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("tasks can be added, edited with subtasks, and moved on the board", async ({
  page,
}, testInfo) => {
  // All tests share one database, so each run works in its own project.
  const res = await page.request.post("/api/projects", {
    data: { name: `Garden ${testInfo.project.name} ${Date.now()}` },
  });
  expect(res.ok()).toBe(true);
  const project = await res.json();
  const errors = trackErrors(page);

  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  await page.getByLabel("Project", { exact: true }).selectOption(String(project.id));
  await page.getByRole("radio", { name: "List" }).check();

  // Quick add
  const newTask = page.getByLabel("New task");
  await newTask.fill("Buy soil");
  await newTask.press("Enter");
  await newTask.fill("Plant seeds");
  await page.getByRole("button", { name: "Add task" }).click();
  const todo = page.getByRole("region", { name: "To do" });
  await expect(todo.getByRole("button", { name: /^Buy soil/ })).toBeVisible();
  await expect(todo.getByRole("button", { name: /^Plant seeds/ })).toBeVisible();

  // Task sheet: edit fields and add a subtask
  await todo.getByRole("button", { name: /^Buy soil/ }).click();
  const sheet = page.getByRole("dialog", { name: "Task" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Priority").selectOption({ label: "High" });
  await sheet.getByLabel("Tags").fill("errands, outdoors");
  await sheet.getByRole("button", { name: "Save task" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Task saved");

  await sheet.getByLabel("New subtask").fill("Compare prices");
  await sheet.getByRole("button", { name: "Add subtask" }).click();
  await sheet.getByRole("checkbox", { name: "Compare prices" }).check();
  await expect(sheet.getByText("1 of 1 done")).toBeVisible();

  // Unsaved edits are caught before the sheet closes.
  await sheet.getByLabel("Title").fill("Buy potting soil");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet.getByText("You have unsaved changes.")).toBeVisible();
  await sheet.getByRole("button", { name: "Save task" }).click();
  await expect(sheet).toBeHidden();

  const row = todo.getByRole("button", { name: /^Buy potting soil/ });
  await expect(row).toContainText("High priority");
  await expect(row).toContainText("errands");

  // The back gesture closes an open sheet.
  await row.click();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();

  // Completing from the list
  // Checking it moves the row into the folded Done section.
  await page.getByRole("checkbox", { name: "Plant seeds" }).click();
  await expect(todo.getByRole("button", { name: /^Plant seeds/ })).toBeHidden();
  await page.locator("summary", { hasText: "Done" }).click();
  await expect(page.getByRole("checkbox", { name: "Plant seeds" })).toBeChecked();

  // Board: the move menu works everywhere
  await page.getByRole("radio", { name: "Board" }).check();
  const doing = page.getByRole("region", { name: "Doing" });
  await expect(doing).toBeVisible();
  // Columns scroll sideways inside the board; the page itself never does.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  await page.getByRole("button", { name: "Move “Buy potting soil”" }).click();
  await page
    .getByRole("dialog", { name: "Move “Buy potting soil”" })
    .getByRole("button", { name: "Doing" })
    .click();
  await expect(doing.getByRole("button", { name: /^Buy potting soil/ })).toBeVisible();

  // Drag and drop on desktop
  if (testInfo.project.name === "desktop") {
    const done = page.getByRole("region", { name: "Done" });
    await doing.getByRole("listitem").filter({ hasText: "Buy potting soil" }).dragTo(done);
    await expect(done.getByRole("button", { name: /^Buy potting soil/ })).toBeVisible();
    await expect(doing.getByRole("button", { name: /^Buy potting soil/ })).toBeHidden();
  }

  // Everything survives a reload.
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Done" }).getByRole("button", { name: /^Plant seeds/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("tasks-board.png"), fullPage: true });
});
