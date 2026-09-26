import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { localDateParts } from "../../server/db/backup";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import {
  assessmentCreateSchema,
  assessmentUpdateSchema,
  courseCreateSchema,
  courseUpdateSchema,
  educationImportSchema,
  termCreateSchema,
  termUpdateSchema,
} from "../../shared/education";
import { readSettings } from "../core/settings.service";
import {
  createAssessment,
  createCourse,
  createTerm,
  deleteAssessment,
  deleteCourse,
  deleteTerm,
  importEducation,
  listTerms,
  updateAssessment,
  updateCourse,
  updateTerm,
} from "./education.service";
import { studyStreak } from "./streak.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric id."));

/**
 * Terms, courses, assessments, and the study streak. Writes answer with every term, so the page
 * refreshes from one response.
 */
export function educationRoutes({ db, config }: Deps) {
  // "Today" for dating passed courses, in the owner's time zone.
  const today = () => localDateParts(new Date(), config.timeZone).date;
  return new Hono<AppEnv>()
    .get("/terms", (c) => c.json(listTerms(db)))
    .get("/streak", (c) =>
      c.json(
        studyStreak(db, {
          now: new Date(),
          timeZone: config.timeZone,
          minimum: readSettings(db).studyMinimumMinutes,
        }),
      ),
    )
    .post("/terms", zValidator("json", termCreateSchema, invalid("That term isn't valid.")), (c) =>
      c.json(createTerm(db, c.req.valid("json")), 201),
    )
    .patch(
      "/terms/:id",
      idParam,
      zValidator("json", termUpdateSchema, invalid("Those term changes aren't valid.")),
      (c) => c.json(updateTerm(db, c.req.valid("param").id, c.req.valid("json"))),
    )
    .delete("/terms/:id", idParam, (c) => {
      deleteTerm(db, c.req.valid("param").id, c.get("user").login);
      return c.body(null, 204);
    })
    .post(
      "/courses",
      zValidator("json", courseCreateSchema, invalid("That course isn't valid.")),
      (c) => c.json(createCourse(db, c.req.valid("json"), c.get("user").login, today()), 201),
    )
    .patch(
      "/courses/:id",
      idParam,
      zValidator("json", courseUpdateSchema, invalid("Those course changes aren't valid.")),
      (c) =>
        c.json(
          updateCourse(
            db,
            c.req.valid("param").id,
            c.req.valid("json"),
            c.get("user").login,
            today(),
          ),
        ),
    )
    .delete("/courses/:id", idParam, (c) =>
      c.json(deleteCourse(db, c.req.valid("param").id, c.get("user").login)),
    )
    .post(
      "/courses/:id/assessments",
      idParam,
      zValidator("json", assessmentCreateSchema, invalid("That assessment isn't valid.")),
      (c) =>
        c.json(
          createAssessment(db, c.req.valid("param").id, c.req.valid("json"), c.get("user").login),
          201,
        ),
    )
    .patch(
      "/assessments/:id",
      idParam,
      zValidator("json", assessmentUpdateSchema, invalid("Those assessment changes aren't valid.")),
      (c) =>
        c.json(
          updateAssessment(db, c.req.valid("param").id, c.req.valid("json"), c.get("user").login),
        ),
    )
    .delete("/assessments/:id", idParam, (c) =>
      c.json(deleteAssessment(db, c.req.valid("param").id, c.get("user").login)),
    )
    .post(
      "/import",
      zValidator(
        "query",
        z.object({ dryRun: z.enum(["true", "false"]).optional() }),
        invalid("Use dryRun=true to preview, or leave it out to import."),
      ),
      zValidator("json", educationImportSchema, invalid("That file can't be imported.")),
      (c) =>
        c.json(
          importEducation(
            db,
            c.req.valid("json"),
            c.get("user").login,
            today(),
            c.req.valid("query").dryRun === "true",
          ),
        ),
    );
}
