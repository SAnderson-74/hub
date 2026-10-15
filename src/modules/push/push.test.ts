import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { body, createTestApp, failure, type TestApp } from "../../server/testing";
import { defaultReminders } from "../../shared/reminders";
import { resetReminderTries, runReminders } from "../integrations/reminders.service";
import { testDevice } from "./testDevice";

let t: TestApp;
beforeEach(() => {
  t = createTestApp();
  resetReminderTries();
});
afterEach(() => {
  vi.restoreAllMocks();
  t.close();
});

const at = (time: string) => new Date(`2025-03-10T${time}:00Z`);
const turnOn = async (device = testDevice(), name = "Phone") => {
  await body(await t.api.push.keys.$post());
  return body(await t.api.push.devices.$post({ json: { ...device.subscription, name } }));
};
const pushService = (status = 201) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(null, { status }));

describe("push notifications", () => {
  it("are off until a device turns them on, and only for push services", async () => {
    expect(await body(await t.api.push.$get())).toEqual({ publicKey: null, devices: [] });
    // No keys yet: a device can't subscribe.
    const device = testDevice();
    expect(
      (await failure(await t.api.push.devices.$post({ json: device.subscription }))).status,
    ).toBe(400);

    const { publicKey } = await body(await t.api.push.keys.$post());
    expect(Buffer.from(publicKey, "base64url")).toHaveLength(65);
    // The same keys every time after.
    expect((await body(await t.api.push.keys.$post())).publicKey).toBe(publicKey);

    const other = testDevice("https://push.example.com/abc");
    expect(
      (await failure(await t.api.push.devices.$post({ json: other.subscription }))).error,
    ).toMatch(/isn't one Hub sends to/);
    const broken = testDevice();
    expect(
      (
        await failure(
          await t.api.push.devices.$post({
            json: { ...broken.subscription, keys: { ...broken.subscription.keys, p256dh: "AAAA" } },
          }),
        )
      ).status,
    ).toBe(400);

    const saved = await body(
      await t.api.push.devices.$post({ json: { ...device.subscription, name: "Phone" } }),
    );
    expect(saved).toMatchObject({
      name: "Phone",
      service: "web.push.apple.com",
      details: false,
      lastSentAt: null,
    });
    // Subscribing again refreshes it rather than adding another.
    await body(await t.api.push.devices.$post({ json: device.subscription }));
    const status = await body(await t.api.push.$get());
    expect(status.devices).toHaveLength(1);
    expect(status.devices[0]?.name).toBe("Phone");
    // The browser can find itself by the endpoint's hash; the endpoint isn't sent back.
    expect(JSON.stringify(status)).not.toContain(device.subscription.endpoint);
    expect(status.devices[0]?.endpointHash).toHaveLength(43);
  });

  it("send reminders encrypted, with counts only on the lock screen unless chosen", async () => {
    await body(
      await t.api.settings.$put({
        json: {
          homeAssistant: { summaryUrl: "", reminderUrl: "", summaryMinutes: 15 },
          reminders: { ...defaultReminders, digest: { enabled: true, time: "07:30" } },
        },
      }),
    );
    await body(
      await t.api.tasks.$post({
        json: { title: "Renew the car registration", dueDate: "2025-03-10" },
      }),
    );
    const device = testDevice();
    const saved = await turnOn(device);
    const fetchMock = pushService();

    await runReminders(t.db, { timeZone: "UTC" }, at("07:31"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(device.subscription.endpoint);
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(headers.get("Authorization")).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(headers.get("TTL")).toBe("86400");
    expect(init?.redirect).toBe("error");
    const sent = device.read(init?.body as Uint8Array);
    expect(sent).toEqual({
      title: "Today in Hub",
      body: "1 task today.",
      tag: "hub-digest",
      url: "/",
    });
    // The ciphertext doesn't carry the task's name.
    expect(Buffer.from(init?.body as Uint8Array).toString()).not.toContain("Renew");
    expect((await body(await t.api.push.$get())).devices[0]?.lastSentAt).not.toBeNull();

    // Chosen to show what's due: the same reminder, by name.
    await body(
      await t.api.push.devices[":id"].$patch({
        param: { id: String(saved.id) },
        json: { details: true },
      }),
    );
    const test = await t.api.integrations.reminders[":kind"].send.$post({
      param: { kind: "digest" },
    });
    expect(test.status).toBe(200);
    const detailed = device.read(fetchMock.mock.calls[1]?.[1]?.body as Uint8Array);
    expect(detailed.title).toMatch(/^Today: 1 task/);
    expect(detailed.body).toContain("Renew the car registration");
  });

  it("drop a device that unsubscribed, and say why a send failed", async () => {
    const saved = await turnOn();
    const send = () => t.api.push.devices[":id"].test.$post({ param: { id: String(saved.id) } });

    pushService(403);
    const refused = await failure(await send());
    expect(refused.status).toBe(502);
    expect(refused.error).toMatch(/refused Hub's signature/);
    expect((await body(await t.api.push.$get())).devices[0]?.lastError).toBe("HTTP_403");

    vi.restoreAllMocks();
    pushService(201);
    expect(await body(await send())).toMatchObject({ sent: 1, failed: 0 });

    vi.restoreAllMocks();
    pushService(410);
    expect((await failure(await send())).status).toBe(502);
    expect((await body(await t.api.push.$get())).devices).toEqual([]);
  });

  it("turn off for one device", async () => {
    const saved = await turnOn();
    expect(
      (await t.api.push.devices[":id"].$delete({ param: { id: String(saved.id) } })).status,
    ).toBe(204);
    expect(
      (await failure(await t.api.push.devices[":id"].$delete({ param: { id: String(saved.id) } })))
        .status,
    ).toBe(404);
    const fetchMock = pushService();
    await runReminders(t.db, { timeZone: "UTC" }, at("07:31"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
