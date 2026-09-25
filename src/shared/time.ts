import { z } from "zod";
import { ENTITY_TYPES, entityRefSchema } from "./entities";

/** Manual entries can't be longer than this. A running timer has no limit. */
export const MAX_ENTRY_MINUTES = 24 * 60;

const instant = z.iso
  .datetime({ offset: true, message: "Use a date and time like 2030-01-31T09:00:00Z." })
  .transform((value) => new Date(value));
const note = z.string().trim().max(500, "Keep notes under 500 characters.");
/** What the time was for, like a task or a project. null for nothing in particular. */
const subject = entityRefSchema.nullable();

export const timeEntryCreateSchema = z
  .object({
    startedAt: instant,
    endedAt: instant,
    note: note.optional(),
    subject: subject.optional(),
  })
  .strict();
export type TimeEntryCreate = z.input<typeof timeEntryCreateSchema>;

export const timeEntryUpdateSchema = z
  .object({ startedAt: instant, endedAt: instant, note, subject })
  .partial()
  .strict();
export type TimeEntryUpdate = z.input<typeof timeEntryUpdateSchema>;

export const timerStartSchema = z
  .object({ note: note.optional(), subject: subject.optional() })
  .strict();
export type TimerStart = z.input<typeof timerStartSchema>;

/** Entries that started in [from, to), optionally only those for one subject. */
export const timeEntryListQuerySchema = z
  .object({
    from: instant.optional(),
    to: instant.optional(),
    type: z.enum(ENTITY_TYPES).optional(),
    id: z.coerce.number().int().positive().optional(),
  })
  .refine((query) => (query.type === undefined) === (query.id === undefined), {
    message: "Pass type and id together.",
    path: ["type"],
  });

/** "1 h 5 min", "45 min", "0 min". */
export function formatMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
