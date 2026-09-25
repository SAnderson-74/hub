import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import {
  timeEntryCreateSchema,
  timeEntryListQuerySchema,
  timeEntryUpdateSchema,
  timerStartSchema,
} from "../../shared/time";
import {
  createEntry,
  deleteEntry,
  getTimer,
  listEntries,
  startTimer,
  stopTimer,
  updateEntry,
} from "./time.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric time entry id."));

/** Time entries and the one running timer. */
export function timeRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get("/timer", (c) => c.json({ timer: getTimer(db) }))
    .post("/timer", zValidator("json", timerStartSchema, invalid("That timer isn't valid.")), (c) =>
      c.json(startTimer(db, c.req.valid("json"), new Date()), 201),
    )
    .post("/timer/stop", (c) => c.json(stopTimer(db, new Date())))
    .get(
      "/entries",
      zValidator("query", timeEntryListQuerySchema, invalid("Those filters aren't valid.")),
      (c) => c.json(listEntries(db, c.req.valid("query"))),
    )
    .post(
      "/entries",
      zValidator("json", timeEntryCreateSchema, invalid("That time entry isn't valid.")),
      (c) => c.json(createEntry(db, c.req.valid("json"), new Date()), 201),
    )
    .patch(
      "/entries/:id",
      idParam,
      zValidator("json", timeEntryUpdateSchema, invalid("Those changes aren't valid.")),
      (c) => c.json(updateEntry(db, c.req.valid("param").id, c.req.valid("json"), new Date())),
    )
    .delete("/entries/:id", idParam, (c) => {
      deleteEntry(db, c.req.valid("param").id);
      return c.body(null, 204);
    });
}
