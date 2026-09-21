import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { settingsPatchSchema } from "../../shared/settings";
import { readSettings, writeSettings } from "./settings.service";

export function settingsRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get("/", (c) => c.json(readSettings(db)))
    .put(
      "/",
      zValidator("json", settingsPatchSchema, (result, c) => {
        if (!result.success) {
          const issues = result.error.issues.map((issue) => ({
            path: issue.path.map(String).join("."),
            message: issue.message,
          }));
          return c.json({ error: "Those settings aren't valid.", issues }, 400);
        }
      }),
      (c) => c.json(writeSettings(db, c.req.valid("json"))),
    );
}
