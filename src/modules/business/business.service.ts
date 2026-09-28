import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, conflict, notFound } from "../../server/errors";
import {
  GEAR_STATUSES,
  type GearCreate,
  type GearUpdate,
  LEAD_STATUSES,
  type LeadCreate,
  type LeadUpdate,
  type NoteCreate,
  type NoteUpdate,
  type PhaseCreate,
  SKILL_STATUSES,
  type SkillCreate,
  type SkillUpdate,
  STARTER_PHASES,
  type StepCreate,
  type StepUpdate,
} from "../../shared/business";
import {
  businessGear,
  businessLeads,
  businessNotes,
  businessPhases,
  businessSkills,
  businessSteps,
} from "./schema";

type StepRow = typeof businessSteps.$inferSelect;
type GearRow = typeof businessGear.$inferSelect;
type SkillRow = typeof businessSkills.$inferSelect;
type LeadRow = typeof businessLeads.$inferSelect;
type NoteRow = typeof businessNotes.$inferSelect;

/** Timestamps as ISO strings, the way the API sends every row. */
function withIsoDates<T extends { createdAt: Date; updatedAt: Date }>(row: T) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

const stepJson = (row: StepRow) => withIsoDates(row);
const gearJson = (row: GearRow) => withIsoDates(row);
const skillJson = (row: SkillRow) => withIsoDates(row);
const leadJson = (row: LeadRow) => withIsoDates(row);
const noteJson = (row: NoteRow) => withIsoDates(row);

export type StepJson = ReturnType<typeof stepJson>;
export type PhaseJson = { id: number; name: string; steps: StepJson[] };
export type GearJson = ReturnType<typeof gearJson>;
export type SkillJson = ReturnType<typeof skillJson>;
export type LeadJson = ReturnType<typeof leadJson>;
export type NoteJson = ReturnType<typeof noteJson>;

export type BusinessJson = {
  /** In order, each with its steps in order. */
  phases: PhaseJson[];
  /** Needed first, then ordered, then owned; by name within each. */
  gear: GearJson[];
  /** Had first, then being learned, then planned; by name within each. */
  skills: SkillJson[];
  /** By status, then the soonest next step, then newest. */
  leads: LeadJson[];
  /** Pinned first, then the most recently changed. */
  notes: NoteJson[];
};

const byOrder =
  <T extends string>(order: readonly T[]) =>
  (a: T, b: T) =>
    order.indexOf(a) - order.indexOf(b);
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** Everything on the Business page in one answer; it's all small. */
export function businessOverview(db: Queryable): BusinessJson {
  const steps = db
    .select()
    .from(businessSteps)
    .orderBy(asc(businessSteps.sortOrder), asc(businessSteps.id))
    .all();
  const phases = db
    .select({ id: businessPhases.id, name: businessPhases.name })
    .from(businessPhases)
    .orderBy(asc(businessPhases.sortOrder), asc(businessPhases.id))
    .all()
    .map((phase) => ({
      ...phase,
      steps: steps.filter((step) => step.phaseId === phase.id).map(stepJson),
    }));
  const gearOrder = byOrder(GEAR_STATUSES);
  const skillOrder = byOrder(SKILL_STATUSES);
  const leadOrder = byOrder(LEAD_STATUSES);
  return {
    phases,
    gear: db
      .select()
      .from(businessGear)
      .all()
      .sort((a, b) => gearOrder(a.status, b.status) || byName(a, b))
      .map(gearJson),
    skills: db
      .select()
      .from(businessSkills)
      .all()
      .sort((a, b) => skillOrder(a.status, b.status) || byName(a, b))
      .map(skillJson),
    leads: db
      .select()
      .from(businessLeads)
      .all()
      .sort(
        (a, b) =>
          leadOrder(a.status, b.status) ||
          (a.nextStepOn ?? "9999").localeCompare(b.nextStepOn ?? "9999") ||
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id - a.id,
      )
      .map(leadJson),
    notes: db
      .select()
      .from(businessNotes)
      .all()
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          b.updatedAt.getTime() - a.updatedAt.getTime() ||
          b.id - a.id,
      )
      .map(noteJson),
  };
}

// Phases

function requirePhase(db: Queryable, id: number, from: "path" | "body" = "path") {
  const row = db.select().from(businessPhases).where(eq(businessPhases.id, id)).get();
  if (row) return row;
  const message = "That phase doesn't exist. It may have been deleted.";
  throw from === "path" ? notFound(message) : badRequest(message);
}

function checkPhaseNameFree(db: Queryable, name: string, exceptId?: number) {
  const taken = db
    .select({ id: businessPhases.id })
    .from(businessPhases)
    .where(sql`lower(${businessPhases.name}) = lower(${name})`)
    .all()
    .some((row) => row.id !== exceptId);
  if (taken) throw conflict(`There's already a phase called "${name}".`);
}

function nextOrder(
  db: Queryable,
  table: typeof businessPhases | typeof businessSteps,
  where?: ReturnType<typeof eq>,
) {
  const row = db
    .select({ top: sql<number | null>`max(${table.sortOrder})` })
    .from(table)
    .where(where)
    .get();
  return (row?.top ?? 0) + 1;
}

export function createPhase(db: Db, input: PhaseCreate) {
  return db.transaction((tx) => {
    checkPhaseNameFree(tx, input.name);
    return tx
      .insert(businessPhases)
      .values({ name: input.name, sortOrder: nextOrder(tx, businessPhases) })
      .returning()
      .get();
  });
}

/** Adds the starter phases to an empty plan. */
export function addStarterPhases(db: Db) {
  return db.transaction((tx) => {
    if (tx.select({ id: businessPhases.id }).from(businessPhases).get()) {
      throw conflict("The plan already has phases. Add more one at a time.");
    }
    STARTER_PHASES.forEach((name, index) => {
      tx.insert(businessPhases)
        .values({ name, sortOrder: index + 1 })
        .run();
    });
    return businessOverview(tx).phases;
  });
}

export function updatePhase(db: Db, id: number, input: PhaseCreate) {
  return db.transaction((tx) => {
    requirePhase(tx, id);
    checkPhaseNameFree(tx, input.name, id);
    return tx
      .update(businessPhases)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(businessPhases.id, id))
      .returning()
      .get();
  });
}

/** Deletes a phase and its steps. */
export function deletePhase(db: Db, id: number) {
  db.transaction((tx) => {
    requirePhase(tx, id);
    tx.delete(businessPhases).where(eq(businessPhases.id, id)).run();
  });
}

// Steps

function requireStep(db: Queryable, id: number): StepRow {
  const row = db.select().from(businessSteps).where(eq(businessSteps.id, id)).get();
  if (!row) throw notFound("That step doesn't exist. It may have been deleted.");
  return row;
}

export function createStep(db: Db, input: StepCreate): StepJson {
  return db.transaction((tx) => {
    requirePhase(tx, input.phaseId, "body");
    const row = tx
      .insert(businessSteps)
      .values({
        phaseId: input.phaseId,
        title: input.title,
        done: input.done ?? false,
        estimateCents: input.estimateCents ?? null,
        spentCents: input.spentCents ?? null,
        dueOn: input.dueOn ?? null,
        notes: input.notes ?? "",
        sortOrder: nextOrder(tx, businessSteps, eq(businessSteps.phaseId, input.phaseId)),
      })
      .returning()
      .get();
    return stepJson(row);
  });
}

export function updateStep(db: Db, id: number, patch: StepUpdate): StepJson {
  return db.transaction((tx) => {
    const step = requireStep(tx, id);
    const moving = patch.phaseId !== undefined && patch.phaseId !== step.phaseId;
    if (moving && patch.phaseId !== undefined) requirePhase(tx, patch.phaseId, "body");
    const row = tx
      .update(businessSteps)
      .set({
        ...patch,
        // A step moved to another phase goes to the end of it.
        ...(moving && patch.phaseId !== undefined
          ? { sortOrder: nextOrder(tx, businessSteps, eq(businessSteps.phaseId, patch.phaseId)) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(businessSteps.id, id))
      .returning()
      .get();
    return stepJson(row);
  });
}

/** Swaps a step with its neighbor in the phase. At either end, nothing changes. */
export function moveStep(db: Db, id: number, to: "earlier" | "later"): StepJson {
  return db.transaction((tx) => {
    const step = requireStep(tx, id);
    const neighbor = tx
      .select()
      .from(businessSteps)
      .where(
        and(
          eq(businessSteps.phaseId, step.phaseId),
          to === "earlier"
            ? lt(businessSteps.sortOrder, step.sortOrder)
            : gt(businessSteps.sortOrder, step.sortOrder),
        ),
      )
      .orderBy(to === "earlier" ? desc(businessSteps.sortOrder) : asc(businessSteps.sortOrder))
      .get();
    if (!neighbor) return stepJson(step);
    tx.update(businessSteps)
      .set({ sortOrder: neighbor.sortOrder })
      .where(eq(businessSteps.id, step.id))
      .run();
    tx.update(businessSteps)
      .set({ sortOrder: step.sortOrder })
      .where(eq(businessSteps.id, neighbor.id))
      .run();
    return stepJson(requireStep(tx, id));
  });
}

export function deleteStep(db: Db, id: number) {
  requireStep(db, id);
  db.delete(businessSteps).where(eq(businessSteps.id, id)).run();
}

// Gear

function requireGear(db: Queryable, id: number): GearRow {
  const row = db.select().from(businessGear).where(eq(businessGear.id, id)).get();
  if (!row) throw notFound("That gear doesn't exist. It may have been deleted.");
  return row;
}

export function createGear(db: Db, input: GearCreate): GearJson {
  return gearJson(
    db
      .insert(businessGear)
      .values({
        name: input.name,
        category: input.category ?? "",
        status: input.status ?? "need",
        costCents: input.costCents ?? null,
        acquiredOn: input.acquiredOn ?? null,
        notes: input.notes ?? "",
      })
      .returning()
      .get(),
  );
}

export function updateGear(db: Db, id: number, patch: GearUpdate): GearJson {
  requireGear(db, id);
  return gearJson(
    db
      .update(businessGear)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(businessGear.id, id))
      .returning()
      .get(),
  );
}

export function deleteGear(db: Db, id: number) {
  requireGear(db, id);
  db.delete(businessGear).where(eq(businessGear.id, id)).run();
}

// Skills

function requireSkill(db: Queryable, id: number): SkillRow {
  const row = db.select().from(businessSkills).where(eq(businessSkills.id, id)).get();
  if (!row) throw notFound("That skill doesn't exist. It may have been deleted.");
  return row;
}

function checkSkillDates(earnedOn: string | null, expiresOn: string | null) {
  if (earnedOn && expiresOn && expiresOn < earnedOn) {
    throw badRequest("The expiry date is before the date it was earned. Check both dates.");
  }
}

export function createSkill(db: Db, input: SkillCreate): SkillJson {
  checkSkillDates(input.earnedOn ?? null, input.expiresOn ?? null);
  return skillJson(
    db
      .insert(businessSkills)
      .values({
        name: input.name,
        kind: input.kind ?? "skill",
        status: input.status ?? "planned",
        earnedOn: input.earnedOn ?? null,
        expiresOn: input.expiresOn ?? null,
        notes: input.notes ?? "",
      })
      .returning()
      .get(),
  );
}

export function updateSkill(db: Db, id: number, patch: SkillUpdate): SkillJson {
  return db.transaction((tx) => {
    const skill = requireSkill(tx, id);
    checkSkillDates(
      patch.earnedOn === undefined ? skill.earnedOn : patch.earnedOn,
      patch.expiresOn === undefined ? skill.expiresOn : patch.expiresOn,
    );
    return skillJson(
      tx
        .update(businessSkills)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(businessSkills.id, id))
        .returning()
        .get(),
    );
  });
}

export function deleteSkill(db: Db, id: number) {
  requireSkill(db, id);
  db.delete(businessSkills).where(eq(businessSkills.id, id)).run();
}

// Leads

function requireLead(db: Queryable, id: number): LeadRow {
  const row = db.select().from(businessLeads).where(eq(businessLeads.id, id)).get();
  if (!row) throw notFound("That lead doesn't exist. It may have been deleted.");
  return row;
}

export function createLead(db: Db, input: LeadCreate): LeadJson {
  return leadJson(
    db
      .insert(businessLeads)
      .values({
        name: input.name,
        contact: input.contact ?? "",
        source: input.source ?? "",
        status: input.status ?? "new",
        valueCents: input.valueCents ?? null,
        nextStep: input.nextStep ?? "",
        nextStepOn: input.nextStepOn ?? null,
        notes: input.notes ?? "",
      })
      .returning()
      .get(),
  );
}

export function updateLead(db: Db, id: number, patch: LeadUpdate): LeadJson {
  requireLead(db, id);
  return leadJson(
    db
      .update(businessLeads)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(businessLeads.id, id))
      .returning()
      .get(),
  );
}

export function deleteLead(db: Db, id: number) {
  requireLead(db, id);
  db.delete(businessLeads).where(eq(businessLeads.id, id)).run();
}

// Notes

function requireNote(db: Queryable, id: number): NoteRow {
  const row = db.select().from(businessNotes).where(eq(businessNotes.id, id)).get();
  if (!row) throw notFound("That note doesn't exist. It may have been deleted.");
  return row;
}

export function createNote(db: Db, input: NoteCreate): NoteJson {
  return noteJson(
    db
      .insert(businessNotes)
      .values({ title: input.title, body: input.body ?? "", pinned: input.pinned ?? false })
      .returning()
      .get(),
  );
}

export function updateNote(db: Db, id: number, patch: NoteUpdate): NoteJson {
  requireNote(db, id);
  return noteJson(
    db
      .update(businessNotes)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(businessNotes.id, id))
      .returning()
      .get(),
  );
}

export function deleteNote(db: Db, id: number) {
  requireNote(db, id);
  db.delete(businessNotes).where(eq(businessNotes.id, id)).run();
}
