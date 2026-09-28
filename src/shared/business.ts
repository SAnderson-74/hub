import { z } from "zod";

// Business prep: a phased plan with costs, gear, skills and certifications, leads, and
// notes. Everything specific to the business is entered in the app.

export const GEAR_STATUSES = ["need", "ordered", "have"] as const;
export type GearStatus = (typeof GEAR_STATUSES)[number];
export const GEAR_STATUS_LABELS: Record<GearStatus, string> = {
  need: "Need",
  ordered: "Ordered",
  have: "Have",
};

export const SKILL_KINDS = ["skill", "certification"] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];
export const SKILL_KIND_LABELS: Record<SkillKind, string> = {
  skill: "Skill",
  certification: "Certification",
};

export const SKILL_STATUSES = ["have", "learning", "planned"] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];
export const SKILL_STATUS_LABELS: Record<SkillStatus, string> = {
  have: "Have",
  learning: "Learning",
  planned: "Planned",
};

export const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};
/** Leads still in play. Won and lost ones are closed. */
export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = ["new", "contacted", "quoted"];

/** Phases to start a plan with, when it's empty. */
export const STARTER_PHASES = ["Research", "Set up", "Launch"] as const;

const date = z.iso.date("Use a date like 2030-01-31.");
const cents = z
  .number()
  .int("Use whole cents.")
  .min(0, "Amounts can't be negative.")
  .max(100_000_000, "Use an amount under $1,000,000.");
const name = (what: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Give the ${what} a name.`)
    .max(max, `Keep ${what} names under ${max} characters.`);
const shortText = (what: string, max: number) =>
  z.string().trim().max(max, `Keep ${what} under ${max} characters.`);
const notes = z.string().max(20_000, "Keep notes under 20,000 characters.");

// Plan

export const phaseCreateSchema = z.object({ name: name("phase", 80) }).strict();
export const phaseUpdateSchema = phaseCreateSchema;
export type PhaseCreate = z.infer<typeof phaseCreateSchema>;

const stepFields = {
  phaseId: z.number().int().positive(),
  title: z
    .string()
    .trim()
    .min(1, "Say what the step is.")
    .max(200, "Keep steps under 200 characters."),
  done: z.boolean(),
  /** What it's expected to cost. */
  estimateCents: cents.nullable(),
  /** What it actually cost so far. */
  spentCents: cents.nullable(),
  dueOn: date.nullable(),
  notes,
};
export const stepCreateSchema = z
  .object(stepFields)
  .partial()
  .required({ phaseId: true, title: true })
  .strict();
export const stepUpdateSchema = z.object(stepFields).partial().strict();
export type StepCreate = z.infer<typeof stepCreateSchema>;
export type StepUpdate = z.infer<typeof stepUpdateSchema>;

/** Moves a step up or down within its phase. */
export const stepMoveSchema = z.object({ to: z.enum(["earlier", "later"]) }).strict();

// Gear

const gearFields = {
  name: name("gear", 120),
  category: shortText("categories", 60),
  status: z.enum(GEAR_STATUSES),
  costCents: cents.nullable(),
  acquiredOn: date.nullable(),
  notes,
};
export const gearCreateSchema = z.object(gearFields).partial().required({ name: true }).strict();
export const gearUpdateSchema = z.object(gearFields).partial().strict();
export type GearCreate = z.infer<typeof gearCreateSchema>;
export type GearUpdate = z.infer<typeof gearUpdateSchema>;

// Skills and certifications

const skillFields = {
  name: name("skill", 120),
  kind: z.enum(SKILL_KINDS),
  status: z.enum(SKILL_STATUSES),
  earnedOn: date.nullable(),
  expiresOn: date.nullable(),
  notes,
};
export const skillCreateSchema = z.object(skillFields).partial().required({ name: true }).strict();
export const skillUpdateSchema = z.object(skillFields).partial().strict();
export type SkillCreate = z.infer<typeof skillCreateSchema>;
export type SkillUpdate = z.infer<typeof skillUpdateSchema>;

// Leads

const leadFields = {
  name: name("lead", 120),
  /** How to reach them, as the owner writes it. */
  contact: shortText("contact details", 200),
  /** Where the lead came from, like a referral. */
  source: shortText("sources", 80),
  status: z.enum(LEAD_STATUSES),
  /** What the work might be worth. */
  valueCents: cents.nullable(),
  nextStep: shortText("next steps", 200),
  nextStepOn: date.nullable(),
  notes,
};
export const leadCreateSchema = z.object(leadFields).partial().required({ name: true }).strict();
export const leadUpdateSchema = z.object(leadFields).partial().strict();
export type LeadCreate = z.infer<typeof leadCreateSchema>;
export type LeadUpdate = z.infer<typeof leadUpdateSchema>;

// Notes

const noteFields = {
  title: z
    .string()
    .trim()
    .min(1, "Give the note a title.")
    .max(120, "Keep note titles under 120 characters."),
  body: notes,
  pinned: z.boolean(),
};
export const noteCreateSchema = z.object(noteFields).partial().required({ title: true }).strict();
export const noteUpdateSchema = z.object(noteFields).partial().strict();
export type NoteCreate = z.infer<typeof noteCreateSchema>;
export type NoteUpdate = z.infer<typeof noteUpdateSchema>;
