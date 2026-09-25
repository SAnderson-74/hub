import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import { entityQuerySchema, linkCreateSchema } from "../../shared/entities";
import { createLink, deleteLink, listLinks } from "./links.service";

export function linkRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get(
      "/",
      zValidator("query", entityQuerySchema, invalid("Pass the type and id to list links for.")),
      (c) => c.json(listLinks(db, c.req.valid("query"))),
    )
    .post("/", zValidator("json", linkCreateSchema, invalid("That link isn't valid.")), (c) =>
      c.json(createLink(db, c.req.valid("json"), c.get("user").login), 201),
    )
    .delete("/:id", zValidator("param", idParamSchema, invalid("Use a numeric link id.")), (c) => {
      deleteLink(db, c.req.valid("param").id, c.get("user").login);
      return c.body(null, 204);
    });
}
