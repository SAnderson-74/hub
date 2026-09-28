import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("business prep: a plan with costs, gear, a lead, the rate, and a note", async ({
  page,
}, testInfo) => {
  // Both device runs share one database, so names are unique per run.
  const id = `${testInfo.project.name} ${Date.now() % 100000}`;
  const errors = trackErrors(page);

  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  if (testInfo.project.name === "iphone") {
    await nav.getByRole("link", { name: "More" }).click();
    await page
      .getByRole("navigation", { name: "More pages" })
      .getByRole("link", { name: "Business" })
      .click();
  } else {
    await nav.getByRole("link", { name: "Business" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Business" })).toBeVisible();
  await page.getByRole("radio", { name: "Plan" }).check();

  // Plan: a phase, a step with a cost, then done.
  const phase = `Phase ${id}`;
  await page.getByLabel("New phase name").fill(phase);
  await page.getByRole("button", { name: "Add phase" }).click();
  const panel = page.getByRole("region", { name: phase });
  await expect(panel).toContainText("No steps yet");
  await panel.getByLabel(`New step in ${phase}`).fill("Get insurance quotes");
  await panel.getByRole("button", { name: `Add step to ${phase}` }).click();
  await panel.getByRole("button", { name: "Get insurance quotes" }).click();
  const step = page.getByRole("dialog", { name: "Step" });
  await step.getByLabel("Estimated cost").fill("120");
  await step.getByLabel("Estimated cost").press("Tab");
  await step.getByRole("button", { name: "Save step" }).click();
  await expect(step.getByRole("status")).toHaveText("Step saved");
  await step.getByRole("button", { name: "Close" }).click();
  await expect(panel).toContainText("About $120");
  await panel.getByRole("checkbox", { name: "Get insurance quotes done" }).check();
  await expect(panel).toContainText("1 of 1 done · $120 estimated");

  // Gear.
  await page.getByRole("radio", { name: "Gear" }).check();
  await page.getByRole("button", { name: "Add gear" }).click();
  const gear = page.getByRole("dialog", { name: "Add gear" });
  await gear.getByLabel("Name").fill(`Ladder ${id}`);
  await gear.getByLabel("Cost").fill("89.99");
  await gear.getByRole("button", { name: "Add gear" }).click();
  await expect(gear).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Need" })
      .getByRole("button", { name: new RegExp(`Ladder ${id}`) }),
  ).toContainText("$89.99");

  // A lead with a next step.
  await page.getByRole("radio", { name: "Leads" }).check();
  await page.getByRole("button", { name: "Add lead" }).click();
  const lead = page.getByRole("dialog", { name: "Add lead" });
  await lead.getByLabel("Name").fill(`Example Bakery ${id}`);
  await lead.getByLabel("Worth about").fill("1500");
  await lead.getByLabel("Next step", { exact: true }).fill("Send a quote");
  await lead.getByRole("button", { name: "Add lead" }).click();
  await expect(
    page
      .getByRole("region", { name: "New" })
      .getByRole("button", { name: new RegExp(`Example Bakery ${id}`) }),
  ).toContainText("Send a quote");

  // Rate: $50,000 to keep, $5,000 of costs, 30% taxes, 25 hours for 46 weeks.
  await page.getByRole("radio", { name: "Rate" }).check();
  await page.getByLabel("Income to keep a year").fill("50000");
  await page.getByLabel("Business costs a year").fill("5000");
  await page.getByLabel("Set aside for taxes").fill("30");
  await page.getByLabel("Billable hours a week").fill("25");
  await page.getByLabel("Working weeks a year").fill("46");
  const rate = page.getByRole("region", { name: "Your rate" });
  await expect(rate).toContainText("$67 an hour");
  await page.getByLabel("Billable hours a week").fill("0");
  await expect(page.getByText("Bill at least 1 hour a week.")).toBeVisible();
  await expect(rate).toContainText("Fix the highlighted numbers");
  await page.getByLabel("Billable hours a week").fill("25");
  await page.getByRole("button", { name: "Save rate inputs" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rate inputs saved" })).toBeVisible();

  // A note, then back to the plan after a reload: the view and data stay.
  await page.getByRole("radio", { name: "Notes" }).check();
  await page.getByRole("button", { name: "Add note" }).click();
  const note = page.getByRole("dialog", { name: "Add note" });
  await note.getByLabel("Title").fill(`Pricing ideas ${id}`);
  await note.getByLabel("Note").fill("Start simple.\nRaise prices once busy.");
  await note.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`Pricing ideas ${id}`) })).toContainText(
    "Start simple.",
  );
  await page.reload();
  await expect(page.getByRole("radio", { name: "Notes" })).toBeChecked();
  await expect(page.getByRole("button", { name: new RegExp(`Pricing ideas ${id}`) })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
