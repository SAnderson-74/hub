import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import {
  goalCreateSchema,
  goalUpdateSchema,
  milestoneCreateSchema,
  milestoneParamSchema,
  milestoneUpdateSchema,
} from "../../shared/goals";
import {
  createGoal,
  createMilestone,
  deleteGoal,
  deleteMilestone,
  getGoal,
  listGoals,
  updateGoal,
  updateMilestone,
} from "./goals.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric goal id."));
const milestoneParam = zValidator(
  "param",
  milestoneParamSchema,
  invalid("Use numeric goal and milestone ids."),
);

/** Goals and their milestones. Tasks are linked to goals through /api/links. */
export function goalRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get("/", (c) => c.json(listGoals(db)))
    .post("/", zValidator("json", goalCreateSchema, invalid("That goal isn't valid.")), (c) =>
      c.json(createGoal(db, c.req.valid("json"), c.get("user").login), 201),
    )
    .get("/:id", idParam, (c) => c.json(getGoal(db, c.req.valid("param").id)))
    .patch(
      "/:id",
      idParam,
      zValidator("json", goalUpdateSchema, invalid("Those goal changes aren't valid.")),
      (c) =>
        c.json(updateGoal(db, c.req.valid("param").id, c.req.valid("json"), c.get("user").login)),
    )
    .delete("/:id", idParam, (c) => {
      deleteGoal(db, c.req.valid("param").id, c.get("user").login);
      return c.body(null, 204);
    })
    .post(
      "/:id/milestones",
      idParam,
      zValidator("json", milestoneCreateSchema, invalid("That milestone isn't valid.")),
      (c) =>
        c.json(
          createMilestone(db, c.req.valid("param").id, c.req.valid("json"), c.get("user").login),
          201,
        ),
    )
    .patch(
      "/:id/milestones/:milestoneId",
      milestoneParam,
      zValidator("json", milestoneUpdateSchema, invalid("Those milestone changes aren't valid.")),
      (c) => {
        const { id, milestoneId } = c.req.valid("param");
        return c.json(
          updateMilestone(db, id, milestoneId, c.req.valid("json"), c.get("user").login),
        );
      },
    )
    .delete("/:id/milestones/:milestoneId", milestoneParam, (c) => {
      const { id, milestoneId } = c.req.valid("param");
      return c.json(deleteMilestone(db, id, milestoneId, c.get("user").login));
    });
}
