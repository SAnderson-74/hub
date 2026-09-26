import type { GoalStatus, GoalUpdate, ProgressMode } from "../../shared/goals";
import { centsToInput, parseDollars } from "../../shared/money";
import type { GoalDetail } from "./queries";

/** The goal sheet's form values. Money is typed in dollars. */
export type GoalDraft = {
  title: string;
  targetDate: string;
  notes: string;
  status: GoalStatus;
  progressMode: ProgressMode;
  manualPercent: number;
  /** "" for no target. */
  target: string;
  current: string;
};

export function toGoalDraft(goal: GoalDetail): GoalDraft {
  return {
    title: goal.title,
    targetDate: goal.targetDate ?? "",
    notes: goal.notes,
    status: goal.status,
    progressMode: goal.progressMode,
    manualPercent: goal.manualPercent,
    target: goal.targetCents === null ? "" : centsToInput(goal.targetCents),
    current: centsToInput(goal.currentCents),
  };
}

/** Problems that block saving, by field. */
export function goalDraftErrors(
  draft: GoalDraft,
): Partial<Record<"title" | "target" | "current", string>> {
  const errors: Partial<Record<"title" | "target" | "current", string>> = {};
  if (!draft.title.trim()) errors.title = "Give the goal a title.";
  if (draft.target.trim() && parseDollars(draft.target) === null) {
    errors.target = "Use an amount like 5000 or 5,000.00.";
  }
  if (draft.current.trim() && parseDollars(draft.current) === null) {
    errors.current = "Use an amount like 1250 or 1,250.00.";
  }
  return errors;
}

/** Only what differs from the saved goal. Call when goalDraftErrors is empty. */
export function goalDraftChanges(goal: GoalDetail, draft: GoalDraft): GoalUpdate {
  const patch: GoalUpdate = {};
  const title = draft.title.trim();
  if (title !== goal.title) patch.title = title;
  if ((draft.targetDate || null) !== goal.targetDate) patch.targetDate = draft.targetDate || null;
  if (draft.notes !== goal.notes) patch.notes = draft.notes;
  if (draft.status !== goal.status) patch.status = draft.status;
  if (draft.progressMode !== goal.progressMode) patch.progressMode = draft.progressMode;
  if (draft.manualPercent !== goal.manualPercent) patch.manualPercent = draft.manualPercent;
  const target = draft.target.trim() ? parseDollars(draft.target) : null;
  if (target !== goal.targetCents) patch.targetCents = target;
  const current = draft.current.trim() ? (parseDollars(draft.current) ?? 0) : 0;
  if (current !== goal.currentCents) patch.currentCents = current;
  return patch;
}
