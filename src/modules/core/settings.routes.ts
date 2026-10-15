import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { applyTimeZone } from "../../server/timeZone";
import { invalid } from "../../server/validate";
import { settingsPatchSchema } from "../../shared/settings";
import { readSettings, writeSettings } from "./settings.service";

export function settingsRoutes({ db, config }: Deps) {
  return new Hono<AppEnv>()
    .get("/", (c) => c.json(readSettings(db)))
    .put(
      "/",
      zValidator("json", settingsPatchSchema, invalid("Those settings aren't valid.")),
      (c) => {
        const saved = writeSettings(db, c.req.valid("json"));
        applyTimeZone(config, saved);
        return c.json(saved);
      },
    );
}
