import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("the calendar feed turns on, serves due dates, and can be replaced", async ({
  page,
}, testInfo) => {
  // Both device sizes share one database; start with the feed off.
  await page.request.delete("/api/integrations/calendar");
  const title = `Renew the lease ${testInfo.project.name}`;
  const due = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  expect((await page.request.post("/api/tasks", { data: { title, dueDate: due } })).ok()).toBe(
    true,
  );
  const errors = trackErrors(page);

  await page.goto("/settings");
  const panel = page.getByRole("region", { name: "Calendar feed" });
  await panel.getByRole("button", { name: "Turn on calendar feed" }).click();
  const address = panel.getByLabel("Calendar address");
  await expect(address).toHaveValue(/\/api\/integrations\/calendar\/feed\/.+\.ics$/);
  await expect(panel.getByRole("link", { name: "Subscribe on this device" })).toHaveAttribute(
    "href",
    /^webcal:\/\//,
  );

  const first = await address.inputValue();
  const feed = await page.request.get(first);
  expect(feed.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
  const text = await feed.text();
  expect(text).toContain("BEGIN:VCALENDAR");
  expect(text).toContain(`SUMMARY:${title}`);

  // A new address stops the old one.
  await panel.getByRole("button", { name: "Get a new address" }).click();
  await panel.getByRole("button", { name: "Make a new address" }).click();
  await expect(panel.getByRole("status")).toHaveText("New calendar address made");
  await expect(address).not.toHaveValue(first);
  expect((await page.request.get(first)).status()).toBe(404);

  await panel.getByRole("button", { name: "Turn off" }).click();
  await panel.getByRole("button", { name: "Turn off calendar feed" }).click();
  await expect(panel.getByRole("button", { name: "Turn on calendar feed" })).toBeVisible();
  expect(errors).toEqual([]);
});
