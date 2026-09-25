import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import { tagUpdateSchema } from "../../shared/entities";
import { deleteTag, listTags, renameTag } from "./tags.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric tag id."));

/** Tags are created by putting them on something (for example a task's `tags`). */
export function tagRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get("/", (c) => c.json(listTags(db)))
    .patch(
      "/:id",
      idParam,
      zValidator("json", tagUpdateSchema, invalid("That tag isn't valid.")),
      (c) => c.json(renameTag(db, c.req.valid("param").id, c.req.valid("json"))),
    )
    .delete("/:id", idParam, (c) => {
      deleteTag(db, c.req.valid("param").id);
      return c.body(null, 204);
    });
}
