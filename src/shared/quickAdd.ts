import { z } from "zod";
import { type Recurrence, WEEKDAY_NAMES } from "./recurrence";
import type { TaskPriority } from "./tasks";
import { TASK_PRIORITY_LABELS } from "./tasks";

// Quick add: a task typed in one line, like "Renew registration next Fri !high #car
// every year". The words that set something become chips the person can see (and
// turn back into plain words) before saving; what's left is the title.
//
//   Dates      today, tonight, tomorrow, mon…sun ("fri", "next fri", "on friday"),
//              next week (Monday), next month (the 1st), in 3 days / 2 weeks / a month,
//              Oct 20, October 20 2027, 10/20, 10/20/27, 2027-10-20
//   Repeats    daily, weekly, monthly, yearly, every day / 2 weeks / month / year,
//              every other week, every weekday, every Tuesday
//   Priority   !high, !medium, !low (or !h, !m, !l, !3, !2, !1)
//   Tags       #car
//   Project    @home matches a project whose name starts with "home"

export type QuickAddChip = {
  kind: "date" | "repeat" | "priority" | "tag" | "project";
  /** The words as typed, like "next Fri". Listing them in `keep` leaves them in the title. */
  text: string;
  /** What it sets: "High priority", "#car", a project's name, the words of a repeat, or a date (YYYY-MM-DD). */
  label: string;
};

export type QuickAddProject = { id: number; name: string; archived?: boolean };

export type QuickAdd = {
  title: string;
  dueDate: string | null;
  priority: TaskPriority | null;
  tags: string[];
  projectId: number | null;
  recurrence: Recurrence | null;
  chips: QuickAddChip[];
};

type Options = {
  /** Today's date, YYYY-MM-DD, in the owner's time zone. */
  today: string;
  projects?: QuickAddProject[];
  /** Matched words to leave as plain text (from chips turned back into words). */
  keep?: string[];
};

export const quickAddSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Type the task.")
      .max(300, "Keep quick adds under 300 characters."),
    /** The project when the text doesn't name one with @. */
    projectId: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type QuickAddInput = z.infer<typeof quickAddSchema>;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_WORD = "(sun|mon|tue|wed|thu|fri|sat)[a-z]*";
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 };

// Date arithmetic on YYYY-MM-DD strings, in UTC so no time zone shifts the day.
const parse = (date: string) => new Date(`${date}T00:00:00Z`);
const format = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const next = parse(date);
  next.setUTCDate(next.getUTCDate() + days);
  return format(next);
};
const addMonths = (date: string, months: number) => {
  const start = parse(date);
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return format(target);
};
const weekdayOf = (date: string) => parse(date).getUTCDay();
const dayIndex = (word: string) =>
  ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(word.slice(0, 3).toLowerCase());
/** The next given weekday after today (a week out when it's today). */
const nextWeekday = (today: string, day: number) =>
  addDays(today, ((day - weekdayOf(today) + 6) % 7) + 1);
/** The given weekday today or later. */
const weekdayFrom = (today: string, day: number) =>
  addDays(today, (day - weekdayOf(today) + 7) % 7);

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return format(date);
}

/** A month and day without a year means the next one: this year, or next if it's passed. */
function upcoming(today: string, month: number, day: number, year?: number): string | null {
  if (year !== undefined) return validDate(year < 100 ? 2000 + year : year, month, day);
  const thisYear = Number(today.slice(0, 4));
  const date = validDate(thisYear, month, day);
  if (date === null) return validDate(thisYear + 1, month, day);
  return date < today ? validDate(thisYear + 1, month, day) : date;
}

type Found = { start: number; end: number; chip: QuickAddChip };

/** Each pattern's first match that isn't overlapping one already taken or kept as text. */
function take(
  text: string,
  pattern: RegExp,
  taken: Found[],
  keep: Set<string>,
  read: (match: RegExpExecArray) => Omit<QuickAddChip, "text"> | null,
  all = false,
): Found[] {
  const found: Found[] = [];
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (keep.has(match[0].trim().toLowerCase())) continue;
    if ([...taken, ...found].some((item) => start < item.end && end > item.start)) continue;
    const chip = read(match as RegExpExecArray);
    if (!chip) continue;
    found.push({ start, end, chip: { ...chip, text: match[0].trim() } });
    if (!all) break;
  }
  taken.push(...found);
  return found;
}

/** Reads a quick-add line into a task. Words it doesn't recognize stay in the title. */
export function parseQuickAdd(text: string, options: Options): QuickAdd {
  const { today } = options;
  const keep = new Set((options.keep ?? []).map((word) => word.toLowerCase()));
  const taken: Found[] = [];
  let dueDate: string | null = null;
  let priority: TaskPriority | null = null;
  let recurrence: Recurrence | null = null;
  let projectId: number | null = null;
  const tags: string[] = [];

  // Repeats first, so "every Friday" isn't read as a date.
  take(
    text,
    new RegExp(
      `\\b(?:every\\s+(other\\s+)?(?:(\\d{1,2})\\s+)?(day|week|month|year|weekday|${DAY_WORD})s?|(daily|weekly|monthly|yearly|annually))\\b`,
      "gi",
    ),
    taken,
    keep,
    (match) => {
      const other = Boolean(match[1]);
      const count = match[2] ? Number(match[2]) : other ? 2 : 1;
      const unit = (match[3] ?? match[5] ?? "").toLowerCase();
      if (count < 1 || count > 99) return null;
      if (unit === "day" || unit === "daily") recurrence = { frequency: "daily", interval: count };
      else if (unit === "week" || unit === "weekly")
        recurrence = { frequency: "weekly", interval: count };
      else if (unit === "month" || unit === "monthly")
        recurrence = { frequency: "monthly", interval: count };
      else if (unit === "year" || unit === "yearly" || unit === "annually") {
        if (count > 8) return null;
        recurrence = { frequency: "monthly", interval: 12 * count };
      } else if (unit === "weekday")
        recurrence = { frequency: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] };
      else {
        const day = dayIndex(unit);
        if (day < 0) return null;
        recurrence = { frequency: "weekly", interval: count, weekdays: [day] };
      }
      return { kind: "repeat", label: match[0].trim() };
    },
  );

  const setDate = (date: string | null) => {
    if (date === null) return null;
    dueDate = date;
    return { kind: "date" as const, label: date };
  };
  const lead = "(?:(?:on|by|due)\\s+)?";
  const datePatterns: Array<[RegExp, (match: RegExpExecArray) => string | null]> = [
    [/\b(?:today|tonight|tod)\b/gi, () => today],
    [/\b(?:tomorrow|tmrw|tmr)\b/gi, () => addDays(today, 1)],
    [/\bnext\s+week\b/gi, () => nextWeekday(today, 1)],
    [/\bnext\s+month\b/gi, () => addMonths(`${today.slice(0, 8)}01`, 1)],
    [
      /\bin\s+(\d{1,3}|a|an|one|two|three|four)\s+(day|week|month)s?\b/gi,
      (match) => {
        const amount = NUMBER_WORDS[(match[1] ?? "").toLowerCase()] ?? Number(match[1]);
        const unit = (match[2] ?? "").toLowerCase();
        if (unit === "day") return addDays(today, amount);
        if (unit === "week") return addDays(today, amount * 7);
        return addMonths(today, amount);
      },
    ],
    [/\b\d{4}-\d{2}-\d{2}\b/g, (match) => validDate(...ymd(match[0]))],
    [
      new RegExp(
        `\\b${lead}(${MONTHS.join("|")})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
        "gi",
      ),
      (match) =>
        upcoming(
          today,
          MONTHS.indexOf((match[1] ?? "").toLowerCase()) + 1,
          Number(match[2]),
          match[3] ? Number(match[3]) : undefined,
        ),
    ],
    [
      new RegExp(`\\b${lead}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?\\b`, "g"),
      (match) =>
        upcoming(
          today,
          Number(match[1]),
          Number(match[2]),
          match[3] ? Number(match[3]) : undefined,
        ),
    ],
    [
      new RegExp(`\\b(?:(?:next|this|on|by|due)\\s+)?${DAY_WORD}\\b`, "gi"),
      (match) => {
        const day = dayIndex(match[1] ?? "");
        const word = (match[0].match(/[a-z]+$/i)?.[0] ?? "").toLowerCase();
        // Words that only start like a day ("friar") don't count, and "sun" and "sat"
        // are ordinary words unless "on", "next", or similar comes first.
        const isDay = WEEKDAY_NAMES.some((name) => name.toLowerCase().startsWith(word));
        const led = match[0].trim().toLowerCase() !== word;
        if (day < 0 || !isDay || (!led && (word === "sun" || word === "sat"))) return null;
        return nextWeekday(today, day);
      },
    ],
  ];
  for (const [pattern, read] of datePatterns) {
    if (dueDate !== null) break;
    take(text, pattern, taken, keep, (match) => setDate(read(match)));
  }

  take(text, /(?<![^\s])!(high|hi|h|medium|med|m|low|lo|l|[123])\b/gi, taken, keep, (match) => {
    const word = (match[1] ?? "").toLowerCase();
    const level = (
      word.startsWith("h") || word === "3" ? 3 : word.startsWith("m") || word === "2" ? 2 : 1
    ) as TaskPriority;
    priority = level;
    return { kind: "priority", label: `${TASK_PRIORITY_LABELS[level]} priority` };
  });

  take(
    text,
    /(?<![^\s])#([\p{L}\p{N}_-]{1,40})/gu,
    taken,
    keep,
    (match) => {
      const tag = match[1] ?? "";
      // A repeat leaves the title like the first, and shows as one chip.
      if (!tags.some((item) => item.toLowerCase() === tag.toLowerCase())) tags.push(tag);
      return { kind: "tag", label: `#${tag}` };
    },
    true,
  );

  const project = (word: string) => {
    const squash = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const target = squash(word);
    const list = [...(options.projects ?? [])].sort(
      (a, b) => Number(a.archived ?? false) - Number(b.archived ?? false),
    );
    return (
      list.find((item) => squash(item.name) === target) ??
      list.find((item) => squash(item.name).startsWith(target))
    );
  };
  take(text, /(?<![^\s])@([\p{L}\p{N}_-]{1,60})/gu, taken, keep, (match) => {
    const found = project(match[1] ?? "");
    if (!found) return null;
    projectId = found.id;
    return { kind: "project", label: found.name };
  });

  // A repeat needs a first date: today for most, the first matching day for weekdays.
  const rule = recurrence as Recurrence | null;
  if (rule && dueDate === null) {
    dueDate = rule.weekdays?.[0] === undefined ? today : firstDay(today, rule.weekdays);
  }

  const cut = [...taken].sort((a, b) => b.start - a.start);
  let title = text;
  for (const item of cut) title = `${title.slice(0, item.start)} ${title.slice(item.end)}`;
  title = title.replace(/\s+/g, " ").trim();

  return {
    title,
    dueDate,
    priority,
    tags,
    projectId,
    recurrence: rule,
    chips: [...taken]
      .sort((a, b) => a.start - b.start)
      .map((item) => item.chip)
      .filter(
        (chip, index, all) =>
          all.findIndex(
            (other) =>
              other.kind === chip.kind && other.label.toLowerCase() === chip.label.toLowerCase(),
          ) === index,
      ),
  };
}

function ymd(text: string): [number, number, number] {
  const [year, month, day] = text.split("-").map(Number);
  return [year ?? 0, month ?? 0, day ?? 0];
}

/** The first of the given weekdays, today or later. */
function firstDay(today: string, weekdays: number[]): string {
  return weekdays.map((day) => weekdayFrom(today, day)).sort()[0] ?? today;
}
