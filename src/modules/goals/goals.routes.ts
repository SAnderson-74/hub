import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { localDateParts } from "../../server/db/backup";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import { goalCheckinSchema } from "../../shared/goalPace";
import {
  goalCreateSchema,
  goalUpdateSchema,
  milestoneCreateSchema,
  milestoneParamSchema,
  milestoneUpdateSchema,
} from "../../shared/goals";
import {
  addCheckin,
  createGoal,
  createMilestone,
  deleteCheckin,
  deleteGoal,
  deleteMilestone,
  getGoal,
  listGoals,
  updateGoal,
  updateMilestone,
} from "./goals.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric goal id."));
const checkinParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  checkinId: z.coerce.number().int().positive(),
});
const milestoneParam = zValidator(
  "param",
  milestoneParamSchema,
  invalid("Use numeric goal and milestone ids."),
);

/** Goals and their milestones. Tasks are linked to goals through /api/links. */
export function goalRoutes({ db, config }: Deps) {
  const today = () => localDateParts(new Date(), config.timeZone).date;
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
    })
    .post(
      "/:id/checkins",
      idParam,
      zValidator("json", goalCheckinSchema, invalid("That check-in isn't valid.")),
      (c) => c.json(addCheckin(db, c.req.valid("param").id, c.req.valid("json"), today()), 201),
    )
    .delete(
      "/:id/checkins/:checkinId",
      zValidator("param", checkinParamSchema, invalid("Use numeric goal and check-in ids.")),
      (c) => {
        const { id, checkinId } = c.req.valid("param");
        return c.json(deleteCheckin(db, id, checkinId));
      },
    );
}
