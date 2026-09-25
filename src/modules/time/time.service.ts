import { and, desc, eq, gte, isNull, lt, type SQL } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, notFound } from "../../server/errors";
import type { EntityRef, EntityType } from "../../shared/entities";
import { MAX_ENTRY_MINUTES } from "../../shared/time";
import { entityLabels, requireEntity } from "../core/entities";
import { timeEntries } from "./schema";

type EntryRow = typeof timeEntries.$inferSelect;

export type TimeEntryJson = {
  id: number;
  startedAt: string;
  /** null while the timer is running. */
  endedAt: string | null;
  minutes: number | null;
  note: string;
  /** label is null when the subject has since been deleted. */
  subject: { type: EntityType; id: number; label: string | null } | null;
};

/** Clocks can disagree by a little between devices; allow this much "future". */
const CLOCK_SKEW_MS = 60_000;

const minutesBetween = (start: Date, end: Date) =>
  Math.round((end.getTime() - start.getTime()) / 60_000);

function toJson(db: Queryable, rows: EntryRow[]): TimeEntryJson[] {
  const idsByType = new Map<EntityType, number[]>();
  for (const row of rows) {
    if (row.subjectType === null || row.subjectId === null) continue;
    idsByType.set(row.subjectType, [...(idsByType.get(row.subjectType) ?? []), row.subjectId]);
  }
  const labels = new Map<string, string>();
  for (const [type, ids] of idsByType) {
    for (const [id, label] of entityLabels(db, type, ids)) labels.set(`${type}:${id}`, label);
  }
  return rows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    minutes: row.minutes,
    note: row.note,
    subject:
      row.subjectType !== null && row.subjectId !== null
        ? {
            type: row.subjectType,
            id: row.subjectId,
            label: labels.get(`${row.subjectType}:${row.subjectId}`) ?? null,
          }
        : null,
  }));
}

const one = (db: Queryable, row: EntryRow): TimeEntryJson => {
  const [entry] = toJson(db, [row]);
  if (!entry) throw new Error("Expected one time entry");
  return entry;
};

/** Checks the subject exists and turns it into column values. */
function subjectColumns(db: Queryable, subject: EntityRef | null | undefined) {
  if (!subject) return { subjectType: null, subjectId: null };
  requireEntity(db, subject, "body");
  return { subjectType: subject.type, subjectId: subject.id };
}

/** Rules for a finished entry: it ends after it starts, isn't in the future, and fits in a day. */
function checkRange(start: Date, end: Date, now: Date) {
  if (
    start.getTime() > now.getTime() + CLOCK_SKEW_MS ||
    end.getTime() > now.getTime() + CLOCK_SKEW_MS
  ) {
    throw badRequest("Time entries can't be in the future. Check the date and times.");
  }
  if (end.getTime() <= start.getTime()) {
    throw badRequest("The end time has to be after the start time.");
  }
  if (minutesBetween(start, end) > MAX_ENTRY_MINUTES) {
    throw badRequest("Keep an entry to 24 hours or less. Split longer stretches into several.");
  }
}

/** Entries that started in [from, to), newest first, optionally for one subject. */
export function listEntries(
  db: Queryable,
  query: { from?: Date; to?: Date; type?: EntityType; id?: number },
): TimeEntryJson[] {
  const conditions: SQL[] = [];
  if (query.from) conditions.push(gte(timeEntries.startedAt, query.from));
  if (query.to) conditions.push(lt(timeEntries.startedAt, query.to));
  if (query.type && query.id !== undefined) {
    conditions.push(eq(timeEntries.subjectType, query.type), eq(timeEntries.subjectId, query.id));
  }
  const rows = db
    .select()
    .from(timeEntries)
    .where(and(...conditions))
    .orderBy(desc(timeEntries.startedAt), desc(timeEntries.id))
    .all();
  return toJson(db, rows);
}

function runningRow(db: Queryable): EntryRow | undefined {
  return db.select().from(timeEntries).where(isNull(timeEntries.endedAt)).get();
}

/** The running timer, or null. */
export function getTimer(db: Queryable): TimeEntryJson | null {
  const row = runningRow(db);
  return row ? one(db, row) : null;
}

function finish(db: Queryable, row: EntryRow, now: Date): EntryRow {
  // A timer stopped within its first minute still counts as one minute.
  const end =
    now.getTime() > row.startedAt.getTime() ? now : new Date(row.startedAt.getTime() + 60_000);
  return db
    .update(timeEntries)
    .set({ endedAt: end, minutes: Math.max(1, minutesBetween(row.startedAt, end)), updatedAt: now })
    .where(eq(timeEntries.id, row.id))
    .returning()
    .get();
}

/** Starts a timer now. A timer that is already running is stopped first. */
export function startTimer(
  db: Db,
  input: { note?: string; subject?: EntityRef | null },
  now: Date,
): { timer: TimeEntryJson; stopped: TimeEntryJson | null } {
  return db.transaction((tx) => {
    const subject = subjectColumns(tx, input.subject);
    const running = runningRow(tx);
    const stopped = running ? finish(tx, running, now) : null;
    const row = tx
      .insert(timeEntries)
      .values({
        startedAt: now,
        note: input.note ?? "",
        ...subject,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return { timer: one(tx, row), stopped: stopped ? one(tx, stopped) : null };
  });
}

export function stopTimer(db: Db, now: Date): TimeEntryJson {
  return db.transaction((tx) => {
    const running = runningRow(tx);
    if (!running) throw notFound("No timer is running. Start one first.");
    return one(tx, finish(tx, running, now));
  });
}

/** Adds time that wasn't tracked with the timer. */
export function createEntry(
  db: Db,
  input: { startedAt: Date; endedAt: Date; note?: string; subject?: EntityRef | null },
  now: Date,
): TimeEntryJson {
  checkRange(input.startedAt, input.endedAt, now);
  return db.transaction((tx) => {
    const row = tx
      .insert(timeEntries)
      .values({
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        minutes: minutesBetween(input.startedAt, input.endedAt),
        note: input.note ?? "",
        ...subjectColumns(tx, input.subject),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return one(tx, row);
  });
}

function requireEntry(db: Queryable, id: number): EntryRow {
  const row = db.select().from(timeEntries).where(eq(timeEntries.id, id)).get();
  if (!row) throw notFound("That time entry doesn't exist. It may have been deleted.");
  return row;
}

export function updateEntry(
  db: Db,
  id: number,
  patch: { startedAt?: Date; endedAt?: Date; note?: string; subject?: EntityRef | null },
  now: Date,
): TimeEntryJson {
  return db.transaction((tx) => {
    const current = requireEntry(tx, id);
    const startedAt = patch.startedAt ?? current.startedAt;
    let endedAt = current.endedAt;
    if (current.endedAt === null) {
      if (patch.endedAt) throw badRequest("Stop the timer first, then change its end time.");
      if (startedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
        throw badRequest("A running timer can't start in the future.");
      }
    } else {
      endedAt = patch.endedAt ?? current.endedAt;
      checkRange(startedAt, endedAt, now);
    }
    const row = tx
      .update(timeEntries)
      .set({
        startedAt,
        endedAt,
        minutes: endedAt ? minutesBetween(startedAt, endedAt) : null,
        note: patch.note ?? current.note,
        ...(patch.subject !== undefined && subjectColumns(tx, patch.subject)),
        updatedAt: now,
      })
      .where(eq(timeEntries.id, id))
      .returning()
      .get();
    return one(tx, row);
  });
}

export function deleteEntry(db: Db, id: number): void {
  requireEntry(db, id);
  db.delete(timeEntries).where(eq(timeEntries.id, id)).run();
}
