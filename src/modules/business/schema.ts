import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { GEAR_STATUSES, LEAD_STATUSES, SKILL_KINDS, SKILL_STATUSES } from "../../shared/business";

const timestamps = () => ({
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** A stage of getting the business going, like research or launch. */
export const businessPhases = sqliteTable("business_phases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sortOrder: real("sort_order").notNull().default(0),
  ...timestamps(),
});

/** One thing to do in a phase, with what it should cost and what it did. */
export const businessSteps = sqliteTable(
  "business_steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    phaseId: integer("phase_id")
      .notNull()
      .references(() => businessPhases.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    estimateCents: integer("estimate_cents"),
    spentCents: integer("spent_cents"),
    dueOn: text("due_on"),
    notes: text("notes").notNull().default(""),
    sortOrder: real("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("business_steps_phase_idx").on(t.phaseId)],
);

/** Equipment for the business: needed, on order, or owned. */
export const businessGear = sqliteTable("business_gear", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  status: text("status", { enum: GEAR_STATUSES }).notNull().default("need"),
  costCents: integer("cost_cents"),
  acquiredOn: text("acquired_on"),
  notes: text("notes").notNull().default(""),
  ...timestamps(),
});

/** A skill or certification: had, being learned, or planned. */
export const businessSkills = sqliteTable("business_skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: SKILL_KINDS }).notNull().default("skill"),
  status: text("status", { enum: SKILL_STATUSES }).notNull().default("planned"),
  earnedOn: text("earned_on"),
  expiresOn: text("expires_on"),
  notes: text("notes").notNull().default(""),
  ...timestamps(),
});

/** A possible customer, from first contact to won or lost. */
export const businessLeads = sqliteTable("business_leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  source: text("source").notNull().default(""),
  status: text("status", { enum: LEAD_STATUSES }).notNull().default("new"),
  valueCents: integer("value_cents"),
  nextStep: text("next_step").notNull().default(""),
  nextStepOn: text("next_step_on"),
  notes: text("notes").notNull().default(""),
  ...timestamps(),
});

/** Free-form notes about the business. Pinned ones come first. */
export const businessNotes = sqliteTable("business_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  ...timestamps(),
});
