import {
  isLastWeekdayOfMonth,
  type MonthWeek,
  monthWeekOf,
  nextInSeries,
  type Recurrence,
  type RecurrenceInput,
  weekdayOf,
} from "../../shared/recurrence";
import type { TaskPriority, TaskStatus, TaskUpdate } from "../../shared/tasks";
import type { TaskDetail } from "./queries";

/** The repeat menu. Yearly is stored as every 12 months. */
export type RepeatChoice = "" | "daily" | "weekly" | "monthly" | "yearly";
/** Which day a monthly or yearly repeat falls on, worked out from the due date. */
export type MonthlyOn = "day" | "weekday" | "lastWeekday" | "lastDay";
export type EndChoice = "never" | "date" | "count";

/** The task sheet's form values, as strings where inputs need them. */
export type Draft = {
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** "" for no due date. */
  dueDate: string;
  /** "" for the inbox, otherwise a project id. */
  projectId: string;
  /** Comma-separated. */
  tags: string;
  /** "" when the task doesn't repeat. */
  repeat: RepeatChoice;
  /** Every how many days, weeks, months, or years, as typed. */
  interval: string;
  /** Weekly: the days it falls on (0 is Sunday). Empty means the due date's day. */
  weekdays: number[];
  monthlyOn: MonthlyOn;
  /** Counts the next one from the day this one is done. */
  fromCompletion: boolean;
  ends: EndChoice;
  /** "" or the last date one can be due. */
  until: string;
  /** How many more after this one, as typed. */
  left: string;
};

export function toDraft(task: TaskDetail): Draft {
  const rule = task.recurrence;
  const yearly = rule?.frequency === "monthly" && rule.interval % 12 === 0;
  return {
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ?? "",
    projectId: task.projectId === null ? "" : String(task.projectId),
    tags: task.tags.map((tag) => tag.name).join(", "),
    repeat: !rule ? "" : yearly ? "yearly" : rule.frequency,
    interval: String(rule ? (yearly ? rule.interval / 12 : rule.interval) : 1),
    weekdays: rule?.weekdays ?? [],
    monthlyOn: rule?.onLastDay
      ? "lastDay"
      : rule?.monthWeek === -1
        ? "lastWeekday"
        : rule?.monthWeek !== undefined
          ? "weekday"
          : "day",
    fromCompletion: rule?.from === "completion",
    ends: rule?.until ? "date" : rule?.left !== undefined ? "count" : "never",
    until: rule?.until ?? "",
    left: String(rule?.left ?? 1),
  };
}

export function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** The typed interval, or null when it isn't a whole number from 1 to `max`. */
export function parseInterval(value: string, max = 99): number | null {
  const interval = Number(value);
  return /^\d+$/.test(value.trim()) && interval >= 1 && interval <= max ? interval : null;
}

/** Years go up to 8 (96 months), the most a stored rule can count. */
export const intervalMax = (repeat: RepeatChoice) => (repeat === "yearly" ? 8 : 99);

/** The typed "how many more", or null when it isn't a whole number from 0 to 999. */
export function parseLeft(value: string): number | null {
  const left = Number(value);
  return /^\d+$/.test(value.trim()) && left <= 999 ? left : null;
}

/** Whether "counts from when it's done" fits: only repeats that aren't on set days. */
export function canCountFromCompletion(draft: Pick<Draft, "repeat" | "weekdays" | "monthlyOn">) {
  if (draft.repeat === "weekly") return draft.weekdays.length === 0;
  if (draft.repeat === "monthly" || draft.repeat === "yearly") return draft.monthlyOn === "day";
  return draft.repeat === "daily";
}

/** Which "on" choices a monthly repeat can offer for a due date. */
export function monthlyChoices(anchor: string): MonthlyOn[] {
  const choices: MonthlyOn[] = ["day"];
  if (monthWeekOf(anchor) <= 4) choices.push("weekday");
  if (isLastWeekdayOfMonth(anchor)) choices.push("lastWeekday");
  choices.push("lastDay");
  return choices;
}

/** Why the repeat fields can't be saved yet, or null when they can. */
export function repeatProblem(draft: Draft): string | null {
  if (draft.repeat === "") return null;
  const max = intervalMax(draft.repeat);
  if (parseInterval(draft.interval, max) === null) return `Use a whole number from 1 to ${max}.`;
  if (draft.ends === "date" && !draft.until) return "Pick the last date it can be due.";
  if (draft.ends === "count" && parseLeft(draft.left) === null) {
    return "Use a whole number from 0 to 999 for how many more.";
  }
  return null;
}

/**
 * The rule the repeat fields describe, for a task due `anchor` (or today when it has
 * no date): null when it doesn't repeat, undefined while a field isn't valid yet.
 */
export function draftRule(draft: Draft, today: string): RecurrenceInput | null | undefined {
  if (draft.repeat === "") return null;
  if (repeatProblem(draft) !== null) return undefined;
  const count = parseInterval(draft.interval, intervalMax(draft.repeat)) ?? 1;
  const anchor = draft.dueDate || today;
  const rule: RecurrenceInput =
    draft.repeat === "yearly"
      ? { frequency: "monthly", interval: count * 12 }
      : { frequency: draft.repeat, interval: count };
  if (draft.repeat === "weekly" && draft.weekdays.length > 0) {
    rule.weekdays = [...draft.weekdays].sort((a, b) => a - b);
  }
  if (rule.frequency === "monthly") {
    const choice = monthlyChoices(anchor).includes(draft.monthlyOn) ? draft.monthlyOn : "day";
    if (choice === "lastDay") rule.onLastDay = true;
    if (choice === "weekday" || choice === "lastWeekday") {
      rule.monthWeek = choice === "lastWeekday" ? -1 : (monthWeekOf(anchor) as MonthWeek);
      rule.weekday = weekdayOf(anchor);
    }
  }
  if (draft.fromCompletion && canCountFromCompletion(draft)) rule.from = "completion";
  if (draft.ends === "date") rule.until = draft.until;
  if (draft.ends === "count") rule.left = parseLeft(draft.left) ?? 0;
  return rule;
}

/** Whether finishing a task due `dueDate` today adds another, or ends its series. */
export function seriesContinues(
  rule: Omit<Recurrence, "monthDay">,
  dueDate: string | null,
  today: string,
): boolean {
  return nextInSeries(rule, dueDate ?? today, today) !== null;
}

/** Only the fields that differ from the saved task. Invalid repeat fields are left out. */
export function draftChanges(task: TaskDetail, draft: Draft, today = ""): TaskUpdate {
  const saved = toDraft(task);
  const patch: TaskUpdate = {};
  if (draft.title.trim() !== saved.title) patch.title = draft.title.trim();
  if (draft.notes !== saved.notes) patch.notes = draft.notes;
  if (draft.status !== saved.status) patch.status = draft.status;
  if (draft.priority !== saved.priority) patch.priority = draft.priority;
  if (draft.dueDate !== saved.dueDate) patch.dueDate = draft.dueDate || null;
  if (draft.projectId !== saved.projectId) {
    patch.projectId = draft.projectId === "" ? null : Number(draft.projectId);
  }
  const tags = parseTags(draft.tags);
  if (tags.join("\n") !== parseTags(saved.tags).join("\n")) patch.tags = tags;
  const rule = draftRule(draft, today);
  if (rule !== undefined && JSON.stringify(rule) !== JSON.stringify(draftRule(saved, today))) {
    patch.recurrence = rule === null ? null : { interval: 1, ...rule };
  }
  return patch;
}
