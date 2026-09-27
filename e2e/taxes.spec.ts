import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("taxes sum up a year of resale and suggest what to set aside", async ({ page }, testInfo) => {
  // Both device runs share one database, so each uses its own past year.
  const year = testInfo.project.name === "iphone" ? 2019 : 2018;
  const errors = trackErrors(page);
  const post = async (url: string, data: object) =>
    (await (await page.request.post(url, { data })).json()) as { id: number };
  const lamp = await post("/api/resale/items", {
    title: `Tax lamp ${year}`,
    purchasedOn: `${year}-02-01`,
    purchaseCents: 40_000,
    status: "sold",
    soldOn: `${year}-03-01`,
    saleCents: 250_000,
  });
  await post(`/api/resale/items/${lamp.id}/costs`, { kind: "fees", amountCents: 5_000 });
  await post("/api/resale/items", {
    title: `Tax chair ${year}`,
    purchasedOn: `${year}-04-01`,
    purchaseCents: 10_000,
    status: "sold",
    soldOn: `${year}-05-01`,
    saleCents: 30_000,
  });
  await post("/api/resale/items", {
    title: `Tax desk ${year}`,
    purchasedOn: `${year}-06-01`,
    purchaseCents: 7_500,
  });

  await page.addInitScript(() => localStorage.setItem("hub.taxes.bracket", "22"));
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  if (testInfo.project.name === "iphone") {
    await nav.getByRole("link", { name: "More" }).click();
    await page
      .getByRole("navigation", { name: "More pages" })
      .getByRole("link", { name: "Taxes" })
      .click();
  } else {
    await nav.getByRole("link", { name: "Taxes" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Taxes" })).toBeVisible();

  await page.getByLabel("Tax year").selectOption(String(year));
  const income = page.getByRole("region", { name: `Resale income in ${year}` });
  await expect(income).toContainText("$2,800");
  await expect(income).toContainText("2 items sold");
  await expect(income).toContainText("$500");
  await expect(income).toContainText("$50");
  await expect(income).toContainText("$2,250");
  await expect(income).toContainText(`1 item bought in ${year} hasn't sold ($75)`);

  // $2,250 profit: $318 self-employment tax plus $460 income tax at 22%.
  const setAside = page.getByRole("region", { name: "Set aside for federal tax" });
  await expect(setAside).toContainText("Set aside about $778 (35% of profit).");
  await setAside.getByLabel("Your income tax bracket").selectOption("12");
  await expect(setAside).toContainText("Set aside about $569 (25% of profit).");

  // Lessons open to show their sources and review date.
  const lessons = page.getByRole("region", { name: "Lessons" });
  const lesson = lessons.getByText("Self-employment tax", { exact: true });
  await lesson.click();
  await expect(
    page.getByRole("link", { name: "Topic no. 554, Self-employment tax" }),
  ).toHaveAttribute("href", "https://www.irs.gov/taxtopics/tc554");
  await expect(
    lessons.locator("details[open]").getByText(/^Reviewed September 27, 2026\./),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
