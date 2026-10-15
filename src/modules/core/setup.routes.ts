import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { invalid } from "../../server/validate";
import { setupSchema } from "../../shared/setup";
import { removeDemo } from "./demo.service";
import { finishSetup, setupStatus } from "./setup.service";

/** First-run setup, and removing example data. */
export function setupRoutes({ db, config }: Deps) {
  return new Hono<AppEnv>()
    .get("/", (c) => c.json(setupStatus(db, config)))
    .post("/", zValidator("json", setupSchema, invalid("Those choices aren't valid.")), (c) =>
      c.json(finishSetup(db, config, c.req.valid("json"), c.get("user").login)),
    )
    .post("/demo/remove", (c) => c.json(removeDemo(db, c.get("user").login)));
}
