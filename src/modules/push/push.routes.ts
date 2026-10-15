import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { badGateway } from "../../server/errors";
import { idParamSchema, invalid } from "../../server/validate";
import { pushSubscribeSchema, pushUpdateSchema } from "../../shared/push";
import {
  prepareKeys,
  pushStatus,
  pushToDevices,
  removeDevice,
  subscribe,
  updateDevice,
} from "./push.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric id."));

/**
 * Notifications: the devices that have them on, turning them on or off for one, and a
 * test. Behind the same sign-in as everything else; push services never call in.
 */
export function pushRoutes({ db }: Deps) {
  return (
    new Hono<AppEnv>()
      .get("/", (c) => c.json(pushStatus(db)))
      // Makes the signing keys the first time, so a browser can subscribe with the public one.
      .post("/keys", (c) => c.json(prepareKeys(db)))
      .post(
        "/devices",
        zValidator(
          "json",
          pushSubscribeSchema,
          invalid("That device's push details aren't valid."),
        ),
        (c) => c.json(subscribe(db, c.req.valid("json")), 201),
      )
      .patch(
        "/devices/:id",
        idParam,
        zValidator("json", pushUpdateSchema, invalid("Those notification settings aren't valid.")),
        (c) => c.json(updateDevice(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/devices/:id", idParam, (c) => {
        removeDevice(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      .post("/devices/:id/test", idParam, async (c) => {
        const outcome = await pushToDevices(
          db,
          {
            title: "Test from Hub",
            body: "Notifications work on this device.",
            brief: { title: "Test from Hub", body: "Notifications work on this device." },
            tag: "hub-test",
            url: "/settings",
          },
          new Date(),
          c.req.valid("param").id,
        );
        if (outcome.sent === 0) throw badGateway(outcome.detail);
        return c.json(outcome);
      })
  );
}
