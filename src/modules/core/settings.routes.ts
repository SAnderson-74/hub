import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { invalid } from "../../server/validate";
import { settingsPatchSchema } from "../../shared/settings";
import { readSettings, writeSettings } from "./settings.service";

export function settingsRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get("/", (c) => c.json(readSettings(db)))
    .put(
      "/",
      zValidator("json", settingsPatchSchema, invalid("Those settings aren't valid.")),
      (c) => c.json(writeSettings(db, c.req.valid("json"))),
    );
}
