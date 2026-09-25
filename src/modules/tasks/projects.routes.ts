import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import { projectCreateSchema, projectUpdateSchema } from "../../shared/tasks";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "./projects.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric project id."));

export function projectRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get("/", (c) => c.json(listProjects(db)))
    .post("/", zValidator("json", projectCreateSchema, invalid("That project isn't valid.")), (c) =>
      c.json(createProject(db, c.req.valid("json"), c.get("user").login), 201),
    )
    .get("/:id", idParam, (c) => c.json(getProject(db, c.req.valid("param").id)))
    .patch(
      "/:id",
      idParam,
      zValidator("json", projectUpdateSchema, invalid("Those project changes aren't valid.")),
      (c) =>
        c.json(
          updateProject(db, c.req.valid("param").id, c.req.valid("json"), c.get("user").login),
        ),
    )
    .delete("/:id", idParam, (c) => {
      deleteProject(db, c.req.valid("param").id, c.get("user").login);
      return c.body(null, 204);
    });
}
