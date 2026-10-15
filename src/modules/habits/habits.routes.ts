import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import {
  checkinParamSchema,
  checkinSchema,
  habitCreateSchema,
  habitUpdateSchema,
} from "../../shared/habits";
import {
  createHabit,
  deleteHabit,
  getHabit,
  listHabits,
  setCheckin,
  updateHabit,
} from "./habits.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric id."));

/** Habits, their strength and recent days, and checking them off. */
export function habitRoutes({ db, config }: Deps) {
  const clock = () => ({ now: new Date(), timeZone: config.timeZone });
  return new Hono<AppEnv>()
    .get("/", (c) => c.json(listHabits(db, clock())))
    .post("/", zValidator("json", habitCreateSchema, invalid("That habit isn't valid.")), (c) =>
      c.json(createHabit(db, c.req.valid("json"), clock()), 201),
    )
    .get("/:id", idParam, (c) => c.json(getHabit(db, c.req.valid("param").id, clock())))
    .patch(
      "/:id",
      idParam,
      zValidator("json", habitUpdateSchema, invalid("Those habit changes aren't valid.")),
      (c) => c.json(updateHabit(db, c.req.valid("param").id, c.req.valid("json"), clock())),
    )
    .delete("/:id", idParam, (c) => {
      deleteHabit(db, c.req.valid("param").id);
      return c.body(null, 204);
    })
    .put(
      "/:id/checkins/:date",
      zValidator(
        "param",
        checkinParamSchema,
        invalid("Use a habit id and a date like 2030-01-31."),
      ),
      zValidator("json", checkinSchema, invalid("Say whether it's done.")),
      (c) => {
        const { id, date } = c.req.valid("param");
        return c.json(setCheckin(db, id, date, c.req.valid("json").done, clock()));
      },
    );
}
