import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

function day(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test("a study plan imports and shows pacing", async ({ page }, testInfo) => {
  // Both device runs share one database, so names and codes are unique per run.
  const id = `${testInfo.project.name.toUpperCase()}${Date.now() % 100000}`;
  const termName = `Term ${id}`;
  const plan = {
    format: "hub-education/v1",
    terms: [
      {
        name: termName,
        startDate: day(-30),
        endDate: day(60),
        creditGoal: 6,
        courses: [
          {
            code: `NET${id}`,
            title: "Introduction to Networks",
            credits: 3,
            status: "in_progress",
            plannedStart: day(-30),
            plannedEnd: day(-5),
            assessments: [
              { kind: "exam", label: "Exam" },
              { kind: "project", label: "Lab project" },
            ],
          },
          {
            code: `OS${id}`,
            title: "Operating Systems",
            credits: 3,
            plannedStart: day(0),
            plannedEnd: day(50),
          },
        ],
      },
    ],
  };
  const errors = trackErrors(page);

  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  if (testInfo.project.name === "iphone") {
    await nav.getByRole("link", { name: "More" }).click();
    await page
      .getByRole("navigation", { name: "More pages" })
      .getByRole("link", { name: "Courses" })
      .click();
  } else {
    await nav.getByRole("link", { name: "Courses" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();

  // Import, after checking what it will do.
  await page.getByRole("button", { name: /^Import( a plan)?$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Import a study plan" });
  await sheet.getByLabel("Or paste it").fill(JSON.stringify(plan));
  await sheet.getByRole("button", { name: "Check file" }).click();
  await expect(sheet.getByText("1 new term")).toBeVisible();
  await expect(sheet.getByText("2 new courses")).toBeVisible();
  await expect(sheet.getByText("2 new assessments")).toBeVisible();
  await sheet.getByRole("button", { name: "Import plan" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Plan imported");
  await sheet.getByRole("button", { name: "Done" }).click();

  await page.getByLabel("Term", { exact: true }).selectOption({ label: termName });
  const credits = page.getByRole("region", { name: "Credits" });
  await expect(credits).toContainText("Behind by 3 credits: 0 of 6 credits, 3 planned by now.");
  const pacing = page.getByRole("region", { name: "Pacing" });
  await expect(pacing.getByRole("button", { name: /Introduction to Networks/ })).toContainText(
    "Past planned end",
  );

  // Pass the course and tick off its exam.
  await page
    .getByRole("region", { name: "Courses" })
    .getByRole("button", { name: /Introduction to Networks/ })
    .click();
  const course = page.getByRole("dialog", { name: "Course" });
  await course.getByLabel("Status").selectOption({ label: "Passed" });
  await course.getByRole("button", { name: "Save course" }).click();
  await expect(course.getByRole("status")).toHaveText("Course saved");
  await course.getByRole("checkbox", { name: "Exam" }).check();
  await expect(course.getByText("1 of 2 done")).toBeVisible();
  await course.getByRole("button", { name: "Close" }).click();

  await expect(credits).toContainText("On pace: 3 of 6 credits, as planned.");
  await expect(pacing.getByRole("button", { name: /Introduction to Networks/ })).toContainText(
    "Passed",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
