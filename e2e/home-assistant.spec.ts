import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    // A failed send answers 502 on purpose below; the browser logs that as an error.
    if (message.type() === "error" && !message.text().includes("502")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("Home Assistant webhooks are checked, and a failed send says why", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/settings");
  const panel = page.getByRole("region", { name: "Home Assistant" });
  await expect(panel).toContainText("Summary: Off.");
  await expect(panel.getByRole("button", { name: "Send summary now" })).toBeDisabled();

  const summary = panel.getByLabel("Summary webhook");
  await summary.fill("ftp://192.0.2.10/hook");
  await panel.getByRole("button", { name: "Save Home Assistant" }).click();
  await expect(
    panel.getByText("Use the full webhook address, starting with http:// or https://."),
  ).toBeVisible();

  // Nothing listens on this port, so the send fails the same way everywhere.
  await summary.fill("http://127.0.0.1:59999/api/webhook/hub-summary-test");
  await panel.getByLabel("Send the summary every").selectOption("30");
  await panel.getByRole("button", { name: "Save Home Assistant" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Home Assistant saved" })).toBeVisible();
  await panel.getByRole("button", { name: "Send summary now" }).click();
  await expect(panel).toContainText(
    /Summary: Last try .*: Couldn't reach Home Assistant\. Check the address and that Hub can reach it\./,
  );
  // Said once, not repeated in a separate alert.
  await expect(panel.getByText(/Couldn't reach Home Assistant/)).toHaveCount(1);

  await panel.getByText("See what the summary sends").click();
  await expect(panel.locator("pre")).toContainText('"type": "hub_summary"');

  // Leave it off for the other tests.
  await summary.fill("");
  await panel.getByRole("button", { name: "Save Home Assistant" }).click();
  await expect(panel).toContainText("Summary: Off.");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(errors).toEqual([]);
});
