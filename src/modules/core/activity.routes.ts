import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { invalid } from "../../server/validate";
import { activityQuerySchema } from "../../shared/entities";
import { listActivity } from "./activity.service";

/** Read-only history. Leave out type and id for everything, newest first. */
export function activityRoutes({ db }: Deps) {
  return new Hono<AppEnv>().get(
    "/",
    zValidator("query", activityQuerySchema, invalid("Those activity filters aren't valid.")),
    (c) => c.json(listActivity(db, c.req.valid("query"))),
  );
}
