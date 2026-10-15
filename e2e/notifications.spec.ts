import { createECDH, randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("notifications are off until a device turns them on, and can be turned off from anywhere", async ({
  page,
}, testInfo) => {
  const errors = trackErrors(page);
  const name = `Test phone ${testInfo.project.name} ${Date.now() % 100000}`;
  // Another device, as a phone's browser would subscribe: an Apple push address and its keys.
  const key = createECDH("prime256v1");
  key.generateKeys();
  expect((await page.request.post("/api/push/keys")).ok()).toBe(true);
  const added = await page.request.post("/api/push/devices", {
    data: {
      endpoint: `https://web.push.apple.com/${randomBytes(12).toString("base64url")}`,
      keys: {
        p256dh: key.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
      name,
    },
  });
  expect(added.ok(), await added.text()).toBe(true);
  const device: { id: number } = await added.json();
  // Always remove it, so reminders on this server never try to reach it.
  try {
    await checkSettings(page, testInfo.project.name, name, key);
  } finally {
    await page.request.delete(`/api/push/devices/${device.id}`);
  }
  expect(errors).toEqual([]);
});

async function checkSettings(
  page: Page,
  project: string,
  name: string,
  key: ReturnType<typeof createECDH>,
) {
  // Anything that isn't a browser's push service is refused.
  const refused = await page.request.post("/api/push/devices", {
    data: {
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: key.getPublicKey().toString("base64url"), auth: "AAAAAAAAAAAAAAAAAAAAAA" },
    },
  });
  expect(refused.status()).toBe(400);

  await page.goto("/settings");
  const panel = page.getByRole("region", { name: "Notifications" });
  // What this browser can do decides what the panel says. On an iPhone, push needs the
  // Home Screen app; a headless browser may have no push, or deny notifications.
  const browser = await page.evaluate(() => ({
    push: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    permission: "Notification" in window ? Notification.permission : "default",
  }));
  if (project.startsWith("iphone")) {
    await expect(panel).toContainText("tap Share, then Add to Home Screen");
  } else if (!browser.push) {
    await expect(panel).toContainText("This browser can't show notifications from Hub.");
  } else if (browser.permission === "denied") {
    await expect(panel).toContainText("Notifications are blocked for Hub in this browser.");
  } else {
    await expect(panel.getByText("Off on this device")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Turn on notifications" })).toBeVisible();
  }

  const others = panel.getByRole("region", { name: "Other devices" });
  await expect(others).toContainText(name);
  await expect(others).toContainText("Counts only · Nothing sent yet");
  await others.getByRole("button", { name: `Turn off notifications for ${name}` }).click();
  await expect(panel.getByText(`Notifications off for ${name}`)).toBeVisible();
  await expect(panel).not.toContainText(`${name}Counts only`);
}
