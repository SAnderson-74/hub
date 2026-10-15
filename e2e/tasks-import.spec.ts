import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("tasks and goals pasted from the Claude Project are added at once", async ({
  page,
}, testInfo) => {
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);
  const answer = {
    format: "hub-tasks/v1",
    projects: [{ name: `Garage ${id}` }],
    tasks: [
      {
        title: `Sort the shelves ${id}`,
        project: `Garage ${id}`,
        due: "2030-04-01",
        priority: "high",
        subtasks: ["Empty the top shelf", "Label the bins"],
      },
      { title: `Pay the bill ${id}`, notes: "Account 000123456789" },
    ],
    goals: [
      {
        title: `Run a 10K ${id}`,
        targetDate: "2030-09-01",
        milestones: [{ title: "Run 5K without stopping" }],
      },
    ],
  };

  await page.goto("/tasks");
  await page.getByRole("button", { name: "Paste tasks from Claude" }).click();
  const sheet = page.getByRole("dialog", { name: "Paste tasks" });
  await sheet
    .getByLabel("Claude Project answer")
    .fill(`Here's your plan:\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``);
  const adds = "Adds 2 tasks with 2 subtasks, 1 goal with 1 milestone, 1 new project";
  await expect(sheet.getByText(adds)).toBeVisible();
  await expect(sheet).toContainText(`Garage ${id} · Due `);
  await expect(sheet).toContainText("Apr 1, 2030 · 2 subtasks");
  await expect(sheet).toContainText("Check it isn't an account, card, or ID number");
  await sheet.getByRole("button", { name: "Add them" }).click();
  await expect(sheet.getByRole("status")).toHaveText(
    "Added 2 tasks with 2 subtasks, 1 goal with 1 milestone, 1 new project",
  );
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(`Sort the shelves ${id}`)).toBeVisible();

  const goals: Array<{ title: string; targetDate: string | null }> = await (
    await page.request.get("/api/goals")
  ).json();
  expect(goals.find((goal) => goal.title === `Run a 10K ${id}`)?.targetDate).toBe("2030-09-01");

  // The same answer again, through Paste from Claude, adds nothing.
  await page.goto("/settings");
  await page
    .getByRole("region", { name: "Imports" })
    .getByRole("button", { name: /Paste from Claude/ })
    .click();
  const paste = page.getByRole("dialog", { name: "Paste from Claude" });
  await paste.getByLabel("Claude Project answer").fill(JSON.stringify(answer));
  await expect(paste.getByText("Tasks and goals, into Tasks")).toBeVisible();
  await expect(paste).toContainText(
    "Nothing new to add. 3 are already in Hub and will be skipped.",
  );
  await expect(paste.getByRole("button", { name: "Nothing to add" })).toBeDisabled();
  expect(errors).toEqual([]);
});
