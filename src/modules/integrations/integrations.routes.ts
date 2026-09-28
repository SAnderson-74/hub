import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { badGateway, badRequest } from "../../server/errors";
import { readSettings } from "../core/settings.service";
import { deliveryStatus, sendReminder, sendSummary, summaryPayload } from "./homeAssistant.service";

/** Home Assistant: what the summary holds, and sending it or a test reminder now. */
export function integrationRoutes({ db, config }: Deps) {
  return new Hono<AppEnv>()
    .get("/home-assistant", (c) => {
      const settings = readSettings(db).homeAssistant;
      return c.json({
        summary: { configured: settings.summaryUrl !== "", last: deliveryStatus().summary },
        reminder: { configured: settings.reminderUrl !== "", last: deliveryStatus().reminder },
      });
    })
    .get("/home-assistant/summary", (c) => c.json(summaryPayload(db, config)))
    .post("/home-assistant/summary/send", async (c) => {
      const delivery = await sendSummary(db, config);
      if (!delivery) throw badRequest("Add the summary webhook address first, then send.");
      if (!delivery.ok) throw badGateway(delivery.detail);
      return c.json(delivery);
    })
    .post("/home-assistant/reminder/test", async (c) => {
      const delivery = await sendReminder(db, {
        title: "Test reminder from Hub",
        message: "If you can read this, reminders reach Home Assistant.",
      });
      if (!delivery) throw badRequest("Add the reminder webhook address first, then send.");
      if (!delivery.ok) throw badGateway(delivery.detail);
      return c.json(delivery);
    });
}
