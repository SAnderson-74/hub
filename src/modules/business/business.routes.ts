import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import {
  gearCreateSchema,
  gearUpdateSchema,
  leadCreateSchema,
  leadUpdateSchema,
  noteCreateSchema,
  noteUpdateSchema,
  phaseCreateSchema,
  phaseUpdateSchema,
  skillCreateSchema,
  skillUpdateSchema,
  stepCreateSchema,
  stepMoveSchema,
  stepUpdateSchema,
} from "../../shared/business";
import {
  addStarterPhases,
  businessOverview,
  createGear,
  createLead,
  createNote,
  createPhase,
  createSkill,
  createStep,
  deleteGear,
  deleteLead,
  deleteNote,
  deletePhase,
  deleteSkill,
  deleteStep,
  moveStep,
  updateGear,
  updateLead,
  updateNote,
  updatePhase,
  updateSkill,
  updateStep,
} from "./business.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric id."));

/** The business plan, gear, skills, leads, and notes. */
export function businessRoutes({ db }: Deps) {
  return (
    new Hono<AppEnv>()
      .get("/", (c) => c.json(businessOverview(db)))
      // Plan
      .post(
        "/phases",
        zValidator("json", phaseCreateSchema, invalid("That phase isn't valid.")),
        (c) => c.json(createPhase(db, c.req.valid("json")), 201),
      )
      .post("/phases/starter", (c) => c.json(addStarterPhases(db), 201))
      .patch(
        "/phases/:id",
        idParam,
        zValidator("json", phaseUpdateSchema, invalid("That phase isn't valid.")),
        (c) => c.json(updatePhase(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/phases/:id", idParam, (c) => {
        deletePhase(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      .post(
        "/steps",
        zValidator("json", stepCreateSchema, invalid("That step isn't valid.")),
        (c) => c.json(createStep(db, c.req.valid("json")), 201),
      )
      .patch(
        "/steps/:id",
        idParam,
        zValidator("json", stepUpdateSchema, invalid("That step isn't valid.")),
        (c) => c.json(updateStep(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .post(
        "/steps/:id/move",
        idParam,
        zValidator("json", stepMoveSchema, invalid("Move a step earlier or later.")),
        (c) => c.json(moveStep(db, c.req.valid("param").id, c.req.valid("json").to)),
      )
      .delete("/steps/:id", idParam, (c) => {
        deleteStep(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      // Gear
      .post("/gear", zValidator("json", gearCreateSchema, invalid("That gear isn't valid.")), (c) =>
        c.json(createGear(db, c.req.valid("json")), 201),
      )
      .patch(
        "/gear/:id",
        idParam,
        zValidator("json", gearUpdateSchema, invalid("That gear isn't valid.")),
        (c) => c.json(updateGear(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/gear/:id", idParam, (c) => {
        deleteGear(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      // Skills and certifications
      .post(
        "/skills",
        zValidator("json", skillCreateSchema, invalid("That skill isn't valid.")),
        (c) => c.json(createSkill(db, c.req.valid("json")), 201),
      )
      .patch(
        "/skills/:id",
        idParam,
        zValidator("json", skillUpdateSchema, invalid("That skill isn't valid.")),
        (c) => c.json(updateSkill(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/skills/:id", idParam, (c) => {
        deleteSkill(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      // Leads
      .post(
        "/leads",
        zValidator("json", leadCreateSchema, invalid("That lead isn't valid.")),
        (c) => c.json(createLead(db, c.req.valid("json")), 201),
      )
      .patch(
        "/leads/:id",
        idParam,
        zValidator("json", leadUpdateSchema, invalid("That lead isn't valid.")),
        (c) => c.json(updateLead(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/leads/:id", idParam, (c) => {
        deleteLead(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      // Notes
      .post(
        "/notes",
        zValidator("json", noteCreateSchema, invalid("That note isn't valid.")),
        (c) => c.json(createNote(db, c.req.valid("json")), 201),
      )
      .patch(
        "/notes/:id",
        idParam,
        zValidator("json", noteUpdateSchema, invalid("That note isn't valid.")),
        (c) => c.json(updateNote(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/notes/:id", idParam, (c) => {
        deleteNote(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
  );
}
