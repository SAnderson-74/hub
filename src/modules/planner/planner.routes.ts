import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { localDateParts } from "../../server/db/backup";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { invalid } from "../../server/validate";
import {
  calendarQuerySchema,
  reviewFinishSchema,
  reviewStepParamSchema,
  reviewStepUpdateSchema,
} from "../../shared/planner";
import { datedItems } from "../integrations/reminders.service";
import { finishReview, getReview, tickStep } from "./review.service";

/** The calendar of everything dated, and the weekly review. */
export function plannerRoutes({ db, config }: Deps) {
  const today = () => localDateParts(new Date(), config.timeZone).date;
  return new Hono<AppEnv>()
    .get(
      "/calendar",
      zValidator("query", calendarQuerySchema, invalid("Ask for dates like 2030-01-31.")),
      (c) => {
        const { from, to } = c.req.valid("query");
        return c.json({ today: today(), items: datedItems(db, from, to) });
      },
    )
    .get("/review", (c) => c.json(getReview(db, today())))
    .put(
      "/review/steps/:step",
      zValidator("param", reviewStepParamSchema, invalid("That review step doesn't exist.")),
      zValidator("json", reviewStepUpdateSchema, invalid("Send whether the step is done.")),
      (c) => c.json(tickStep(db, today(), c.req.valid("param").step, c.req.valid("json").done)),
    )
    .put(
      "/review/finished",
      zValidator("json", reviewFinishSchema, invalid("Send whether the review is finished.")),
      (c) => c.json(finishReview(db, today(), c.req.valid("json").finished)),
    );
}
