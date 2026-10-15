import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("quick add reads dates, priority, and tags, and shows them first", async ({
  page,
}, testInfo) => {
  const errors = trackErrors(page);
  // Both device runs share one database, so titles are unique per run.
  const id = `${testInfo.project.name}${Date.now() % 100000}`;
  await page.goto("/tasks");
  // By role: the command menu has a "New task" group too, still on screen for a moment
  // after it's chosen from.
  const field = page.getByRole("textbox", { name: "New task" });
  await field.fill(`Renew registration ${id} tomorrow !high #car`);
  const chips = page.getByRole("list", { name: "Read from the task" });
  await expect(chips.getByRole("listitem")).toHaveCount(3);
  await expect(chips).toContainText("High priority");
  await expect(chips).toContainText("Tag #car");
  await expect(page.getByText(`Adds “Renew registration ${id}”.`)).toBeVisible();

  // Turning a chip back keeps its words in the title.
  await chips.getByRole("button", { name: "Keep “#car” in the title" }).click();
  await expect(chips.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText(`Adds “Renew registration ${id} #car”.`)).toBeVisible();
  await field.press("Enter");
  await expect(field).toHaveValue("");
  const row = page.getByRole("button", { name: new RegExp(`Renew registration ${id} #car`) });
  await expect(row).toContainText("Due tomorrow");
  await expect(row).toContainText("High");

  // From the command menu, the words land in the field with their chips.
  await page.getByRole("button", { name: "Search", exact: true }).locator("visible=true").click();
  const menu = page.getByRole("dialog", { name: "Search and commands" });
  await menu.getByRole("combobox").fill(`Water plants ${id} every week`);
  await menu
    .getByRole("option", { name: new RegExp(`Add “Water plants ${id} every week” as a task`) })
    .click();
  await expect(field).toHaveValue(`Water plants ${id} every week`);
  await expect(field).toBeFocused();
  await expect(chips).toContainText("Repeats");
  await field.press("Enter");
  await expect(page.getByRole("button", { name: new RegExp(`Water plants ${id}`) })).toContainText(
    "Due today",
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
