import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import { taskCreateSchema, taskListQuerySchema, taskUpdateSchema } from "../../shared/tasks";
import { createTask, deleteTask, getTask, listTasks, updateTask } from "./tasks.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric task id."));

export function taskRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get(
      "/",
      zValidator("query", taskListQuerySchema, invalid("Those filters aren't valid.")),
      (c) => c.json(listTasks(db, c.req.valid("query"))),
    )
    .post("/", zValidator("json", taskCreateSchema, invalid("That task isn't valid.")), (c) =>
      c.json(createTask(db, c.req.valid("json"), c.get("user").login), 201),
    )
    .get("/:id", idParam, (c) => c.json(getTask(db, c.req.valid("param").id)))
    .patch(
      "/:id",
      idParam,
      zValidator("json", taskUpdateSchema, invalid("Those task changes aren't valid.")),
      (c) =>
        c.json(updateTask(db, c.req.valid("param").id, c.req.valid("json"), c.get("user").login)),
    )
    .delete("/:id", idParam, (c) => {
      deleteTask(db, c.req.valid("param").id, c.get("user").login);
      return c.body(null, 204);
    });
}
