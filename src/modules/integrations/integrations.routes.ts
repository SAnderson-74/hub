import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { badGateway, badRequest } from "../../server/errors";
import { invalid } from "../../server/validate";
import { REMINDER_KINDS, REMINDER_LABELS } from "../../shared/reminders";
import { readSettings } from "../core/settings.service";
import { deliveryStatus, sendReminder, sendSummary, summaryPayload } from "./homeAssistant.service";
import { previewReminders, recentReminders, sendReminderNow } from "./reminders.service";

/**
 * Home Assistant: what the summary holds, and sending it or a test reminder now.
 * Reminders: what each would say, the latest sent, and sending one now.
 */
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
        kind: "test",
        title: "Test reminder from Hub",
        message: "If you can read this, reminders reach Home Assistant.",
      });
      if (!delivery) throw badRequest("Add the reminder webhook address first, then send.");
      if (!delivery.ok) throw badGateway(delivery.detail);
      return c.json(delivery);
    })
    .get("/reminders", (c) =>
      c.json({
        configured: readSettings(db).homeAssistant.reminderUrl !== "",
        previews: previewReminders(db, config),
        recent: recentReminders(db),
      }),
    )
    .post(
      "/reminders/:kind/send",
      zValidator(
        "param",
        z.object({ kind: z.enum(REMINDER_KINDS) }),
        invalid("Pick the digest, due soon, or streak reminder."),
      ),
      async (c) => {
        const { kind } = c.req.valid("param");
        if (readSettings(db).homeAssistant.reminderUrl === "") {
          throw badRequest(
            "Add the reminder webhook address under Home Assistant first, then send.",
          );
        }
        const { built, delivery } = await sendReminderNow(db, config, kind);
        if (!built) {
          throw badRequest(
            `${REMINDER_LABELS[kind]} has nothing to say right now, so nothing was sent.`,
          );
        }
        if (!delivery?.ok) throw badGateway(delivery?.detail ?? "Couldn't reach Home Assistant.");
        return c.json(delivery);
      },
    );
}
