import { z } from "zod";
import { formatCents } from "./money";

export const GOAL_STATUSES = ["active", "achieved", "dropped"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Active",
  achieved: "Achieved",
  dropped: "Dropped",
};

/** Where a goal's progress comes from. */
export const PROGRESS_MODES = ["milestones", "tasks", "amount", "manual"] as const;
export type ProgressMode = (typeof PROGRESS_MODES)[number];

export const PROGRESS_MODE_LABELS: Record<ProgressMode, string> = {
  milestones: "Milestones done",
  tasks: "Linked tasks done",
  amount: "An amount of money",
  manual: "By hand",
};

/** The relation name for a task linked to a goal (task → goal). */
export const GOAL_TASK_RELATION = "goal";

const title = z
  .string()
  .trim()
  .min(1, "Give it a title.")
  .max(200, "Keep titles under 200 characters.");
const targetDate = z.iso.date("Use a date like 2030-01-31.").nullable();
const notes = z.string().max(20_000, "Keep notes under 20,000 characters.");
const cents = z
  .number()
  .int("Use whole cents.")
  .min(0, "Amounts can't be negative.")
  .max(1_000_000_000_00, "That amount is too large.");
const percent = z.number().int().min(0, "Use 0 to 100.").max(100, "Use 0 to 100.");

export const goalCreateSchema = z
  .object({
    title,
    notes: notes.optional(),
    targetDate: targetDate.optional(),
    progressMode: z.enum(PROGRESS_MODES).optional(),
    manualPercent: percent.optional(),
    targetCents: cents.nullable().optional(),
    currentCents: cents.optional(),
  })
  .strict();
export type GoalCreate = z.infer<typeof goalCreateSchema>;

export const goalUpdateSchema = z
  .object({
    title,
    notes,
    targetDate,
    status: z.enum(GOAL_STATUSES),
    progressMode: z.enum(PROGRESS_MODES),
    manualPercent: percent,
    targetCents: cents.nullable(),
    currentCents: cents,
    sortOrder: z.number(),
  })
  .partial()
  .strict();
export type GoalUpdate = z.infer<typeof goalUpdateSchema>;

export const milestoneCreateSchema = z
  .object({ title, targetDate: targetDate.optional() })
  .strict();
export type MilestoneCreate = z.infer<typeof milestoneCreateSchema>;

export const milestoneUpdateSchema = z
  .object({ title, targetDate, done: z.boolean(), sortOrder: z.number() })
  .partial()
  .strict();
export type MilestoneUpdate = z.infer<typeof milestoneUpdateSchema>;

export const milestoneParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  milestoneId: z.coerce.number().int().positive(),
});

export type ProgressInput = {
  mode: ProgressMode;
  milestones: { done: number; total: number };
  tasks: { done: number; total: number };
  manualPercent: number;
  currentCents: number;
  targetCents: number | null;
};

/** Progress from 0 to 100, plus a short description like "3 of 5 milestones". */
export function computeProgress(input: ProgressInput): { percent: number; summary: string } {
  const ratio = (done: number, total: number) => (total === 0 ? 0 : (done / total) * 100);
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.floor(value)));
  switch (input.mode) {
    case "milestones": {
      const { done, total } = input.milestones;
      return {
        percent: clamp(ratio(done, total)),
        summary: total === 0 ? "No milestones yet" : `${done} of ${total} milestones`,
      };
    }
    case "tasks": {
      const { done, total } = input.tasks;
      return {
        percent: clamp(ratio(done, total)),
        summary: total === 0 ? "No linked tasks yet" : `${done} of ${total} tasks`,
      };
    }
    case "amount": {
      const target = input.targetCents;
      if (!target)
        return { percent: 0, summary: `${formatCents(input.currentCents)} saved, no target yet` };
      return {
        percent: clamp(ratio(input.currentCents, target)),
        summary: `${formatCents(input.currentCents)} of ${formatCents(target)}`,
      };
    }
    case "manual":
      return { percent: clamp(input.manualPercent), summary: "Set by hand" };
  }
}
