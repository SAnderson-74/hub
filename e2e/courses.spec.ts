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

test("time on a course keeps the study streak going", async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  const termRes = await page.request.post("/api/education/terms", {
    data: {
      name: `Streak ${testInfo.project.name} ${Date.now()}`,
      startDate: day(-30),
      endDate: day(60),
    },
  });
  const [term] = (await termRes.json()) as Array<{ id: number; name: string }>;
  if (!term) throw new Error("Expected a term");
  const courseRes = await page.request.post("/api/education/courses", {
    data: { termId: term.id, title: "Study skills" },
  });
  const course = ((await courseRes.json()) as Array<{ id: number; courses: Array<{ id: number }> }>)
    .find((item) => item.id === term.id)
    ?.courses.at(0);
  if (!course) throw new Error("Expected a course");
  // Half an hour of study yesterday, at this time of day, so it never straddles midnight.
  const started = Date.now() - 24 * 60 * 60_000;
  const logged = await page.request.post("/api/time/entries", {
    data: {
      startedAt: new Date(started).toISOString(),
      endedAt: new Date(started + 30 * 60_000).toISOString(),
      subject: { type: "course", id: course.id },
    },
  });
  expect(logged.status()).toBe(201);
  // Both device runs share one database, so change the minimum to something new.
  const settings = (await (await page.request.get("/api/settings")).json()) as {
    studyMinimumMinutes: number;
  };
  const minimum = settings.studyMinimumMinutes === 25 ? 20 : 25;

  const open = async (name: string) => {
    const nav = page.getByRole("navigation", { name: "Main" });
    if (testInfo.project.name === "iphone") {
      await nav.getByRole("link", { name: "More" }).click();
      await page
        .getByRole("navigation", { name: "More pages" })
        .getByRole("link", { name })
        .click();
    } else {
      await nav.getByRole("link", { name }).click();
    }
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  };

  await page.goto("/");
  await open("Settings");
  const setting = page.getByRole("region", { name: "Study streak" });
  await setting.getByLabel("Minutes of study a day").fill("2");
  await expect(setting.getByText("Use at least 5 minutes a day.")).toBeVisible();
  await expect(setting.getByRole("button", { name: "Save minimum" })).toBeDisabled();
  await setting.getByLabel("Minutes of study a day").fill(String(minimum));
  await setting.getByRole("button", { name: "Save minimum" }).click();
  await expect(setting.getByRole("status")).toHaveText("Minimum saved");

  await open("Courses");
  await page.getByLabel("Term", { exact: true }).selectOption({ label: term.name });
  const streak = page.getByRole("region", { name: "Study streak" });
  // Yesterday met the minimum; today still needs study.
  await expect(streak).toContainText(/\d+ days? in a row/);
  await expect(streak).toContainText(`Study ${minimum} min more today to keep the streak going.`);
  await expect(streak.getByRole("table")).toContainText("minimum met");
  await expect(streak.getByRole("table")).toContainText("(today): 0 min");

  await streak.getByRole("link", { name: "Change minimum" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
