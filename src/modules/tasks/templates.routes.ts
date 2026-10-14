import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import {
  templateCreateSchema,
  templateFromSchema,
  templateUpdateSchema,
  templateUseSchema,
} from "../../shared/templates";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  renameTemplate,
  templateFrom,
  useTemplate,
} from "./templates.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric template id."));

/** Reusable tasks and projects. */
export function templateRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get("/", (c) => c.json(listTemplates(db)))
    .post(
      "/",
      zValidator("json", templateCreateSchema, invalid("That template isn't valid.")),
      (c) => c.json(createTemplate(db, c.req.valid("json")), 201),
    )
    .post(
      "/from",
      zValidator("json", templateFromSchema, invalid("Pick a task or a project, and a name.")),
      (c) => c.json(templateFrom(db, c.req.valid("json")), 201),
    )
    .patch(
      "/:id",
      idParam,
      zValidator("json", templateUpdateSchema, invalid("That name isn't valid.")),
      (c) => c.json(renameTemplate(db, c.req.valid("param").id, c.req.valid("json").name)),
    )
    .delete("/:id", idParam, (c) => {
      deleteTemplate(db, c.req.valid("param").id);
      return c.body(null, 204);
    })
    .post(
      "/:id/use",
      idParam,
      zValidator("json", templateUseSchema, invalid("Pick the day to count due dates from.")),
      (c) =>
        c.json(
          useTemplate(db, c.req.valid("param").id, c.req.valid("json"), c.get("user").login),
          201,
        ),
    );
}
