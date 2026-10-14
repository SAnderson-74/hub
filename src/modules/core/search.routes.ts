import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { invalid } from "../../server/validate";
import { searchQuerySchema } from "../../shared/search";
import { search } from "./search.service";

/** `GET /api/search?q=lamp` finds matches in every turned-on module. */
export function searchRoutes({ db }: Deps) {
  return new Hono<AppEnv>().get(
    "/",
    zValidator("query", searchQuerySchema, invalid("That search isn't valid.")),
    (c) => c.json(search(db, c.req.valid("query"))),
  );
}
