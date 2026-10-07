import { addMonths } from "./recurrence";

// Sorting and filtering shared by the Money transaction list (done by the server, a
// page at a time) and the Tithing lists (done in the browser). Amounts are compared by
// size, so "$200 or more" finds a $200 paycheck and a $200 bill alike.

export const SORTS = ["newest", "oldest", "largest", "smallest"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  largest: "Largest amount first",
  smallest: "Smallest amount first",
};

export const DATE_PRESETS = [
  { id: "1m", label: "1 month" },
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "1y", label: "1 year" },
  { id: "ytd", label: "This year" },
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number]["id"];

/** The dates a preset covers up to today: "1 month" is the month ending today. */
export function presetRange(preset: DatePreset, today: string): { from: string; to: string } {
  const months = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 } as const;
  if (preset === "ytd") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: addMonths(today, -months[preset]), to: today };
}

/** The preset whose dates these are, if any, so its chip shows as picked. */
export function presetOf(from: string, to: string, today: string): DatePreset | null {
  return (
    DATE_PRESETS.find((preset) => {
      const range = presetRange(preset.id, today);
      return range.from === from && range.to === to;
    })?.id ?? null
  );
}

type Sortable = { id: number; date: string; amountCents: number };

/** Orders rows for a sort; ties go newest first so the order is steady. */
export function compareFor(sort: Sort): (a: Sortable, b: Sortable) => number {
  const newest = (a: Sortable, b: Sortable) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id;
  switch (sort) {
    case "newest":
      return newest;
    case "oldest":
      return (a, b) => -newest(a, b);
    case "largest":
      return (a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents) || newest(a, b);
    case "smallest":
      return (a, b) => Math.abs(a.amountCents) - Math.abs(b.amountCents) || newest(a, b);
  }
}

/** Whether an amount's size is within the limits (either may be null for none). */
export function inAmountRange(
  amountCents: number,
  minCents: number | null,
  maxCents: number | null,
): boolean {
  const size = Math.abs(amountCents);
  return (minCents === null || size >= minCents) && (maxCents === null || size <= maxCents);
}

/** Whether a date is within the limits, both ends included. */
export function inDateRange(date: string, from: string | null, to: string | null): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

/** Whether every word typed is in the text, ignoring case: "paycheck march" finds both. */
export function matchesWords(text: string, query: string): boolean {
  const haystack = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** A slider's top: the largest amount, rounded up to a tidy number of dollars. */
export function sliderMax(maxCents: number): number {
  const dollars = Math.max(1, Math.ceil(maxCents / 100));
  const step = dollars <= 100 ? 10 : dollars <= 1_000 ? 50 : dollars <= 10_000 ? 500 : 5_000;
  return Math.ceil(dollars / step) * step;
}

/** What the lists is narrowed to besides the account, card, and search. */
export type ListFilters = {
  /** YYYY-MM-DD, or "" for no limit. */
  from: string;
  to: string;
  /** Limits on an amount's size, in whole dollars, or null for none. */
  minDollars: number | null;
  maxDollars: number | null;
  /** Several categories at once: ids, "none", or "transfer". */
  categories: string[];
};

export const noFilters: ListFilters = {
  from: "",
  to: "",
  minDollars: null,
  maxDollars: null,
  categories: [],
};

/** How many of the filters in the sheet are in use. */
export function filterCount(filters: ListFilters): number {
  return (
    (filters.from || filters.to ? 1 : 0) +
    (filters.minDollars !== null || filters.maxDollars !== null ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0)
  );
}
