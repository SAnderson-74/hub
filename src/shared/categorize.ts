import { z } from "zod";
import { type CategoryKind, ruleMatchSchema } from "./books";
import { matchRule, type RuleLike } from "./moneyRules";
import { merchantWords, payeeGroup } from "./payees";

// Sorting uncategorized transactions: group similar ones (the same merchant, or the
// same person on a payment app), notice ones that repeat, and suggest a category
// from the book's rules, from how similar transactions were categorized before, and
// from common words matched to the book's own category names.

export type PendingTransaction = {
  id: number;
  date: string;
  amountCents: number;
  payee: string;
  memo: string;
  counterparty: string | null;
};

export type CategorizedTransaction = {
  amountCents: number;
  payee: string;
  memo: string;
  counterparty: string | null;
  categoryId: number;
};

export type CategoryOption = { id: number; name: string; kind: CategoryKind; archived: boolean };

export type Confidence = "high" | "medium" | "low";

export type Suggestion = { categoryId: number; confidence: Confidence; reason: string };

export type Repeats = { every: "week" | "two weeks" | "month" | "year"; typicalCents: number };

export type TransactionGroup = {
  key: string;
  name: string;
  /** Text for a rule that would find more like these. */
  ruleText: string;
  /** Whether a rule should look at money out, money in, or both. */
  direction: "out" | "in" | "any";
  transactionIds: number[];
  inCents: number;
  /** Money out, as a positive amount. */
  outCents: number;
  firstDate: string;
  lastDate: string;
  /** The most recent few, to show what's in the group. */
  examples: PendingTransaction[];
  repeats: Repeats | null;
  suggestion: Suggestion | null;
};

const EXAMPLES = 5;

// Common words, and the category names they suggest. The name has to be one of the
// book's categories, so nothing is suggested that the person hasn't set up.
const HINTS: ReadonlyArray<{
  words: readonly string[];
  names: readonly string[];
  reason: string;
  kind: CategoryKind;
}> = [
  {
    words: ["payroll", "salary", "direct dep", "direct deposit", "paycheck", "wages"],
    names: ["paycheck", "salary", "wage", "payroll", "income", "pay"],
    reason: "Looks like a paycheck",
    kind: "income",
  },
  {
    words: ["interest", "dividend"],
    names: ["interest", "dividend", "investment"],
    reason: "Looks like interest or dividends",
    kind: "income",
  },
  {
    words: [
      "grocery",
      "groceries",
      "supermarket",
      "market",
      "foods",
      "safeway",
      "kroger",
      "aldi",
      "costco",
      "trader joes",
      "whole foods",
      "publix",
      "wegmans",
      "heb",
      "fred meyer",
      "qfc",
      "sprouts",
    ],
    names: ["grocer", "food"],
    reason: "Looks like a grocery store",
    kind: "expense",
  },
  {
    words: [
      "restaurant",
      "cafe",
      "coffee",
      "espresso",
      "pizza",
      "grill",
      "diner",
      "bistro",
      "kitchen",
      "taco",
      "tacos",
      "burger",
      "burgers",
      "sushi",
      "bakery",
      "starbucks",
      "mcdonalds",
      "chipotle",
      "subway",
      "doordash",
      "grubhub",
      "uber eats",
      "tea",
      "boba",
      "bar",
      "pub",
      "brewing",
    ],
    names: ["dining", "restaurant", "eating out", "takeout", "coffee", "food"],
    reason: "Looks like a restaurant or cafe",
    kind: "expense",
  },
  {
    words: [
      "gas",
      "fuel",
      "shell",
      "chevron",
      "exxon",
      "exxonmobil",
      "mobil",
      "arco",
      "texaco",
      "valero",
      "sunoco",
      "citgo",
      "marathon",
      "speedway",
    ],
    names: ["gas", "fuel", "auto", "car", "transport"],
    reason: "Looks like a gas station",
    kind: "expense",
  },
  {
    words: [
      "uber",
      "lyft",
      "transit",
      "metro",
      "parking",
      "toll",
      "tolls",
      "taxi",
      "airlines",
      "airline",
      "amtrak",
    ],
    names: ["transport", "travel", "commute", "car", "auto", "parking"],
    reason: "Looks like getting around",
    kind: "expense",
  },
  {
    words: [
      "netflix",
      "spotify",
      "hulu",
      "disney",
      "hbo",
      "max",
      "youtube",
      "icloud",
      "patreon",
      "paramount",
      "peacock",
      "audible",
      "subscription",
    ],
    names: ["subscription", "streaming", "entertainment"],
    reason: "Looks like a subscription",
    kind: "expense",
  },
  {
    words: [
      "pharmacy",
      "cvs",
      "walgreens",
      "rite aid",
      "clinic",
      "dental",
      "dentist",
      "medical",
      "hospital",
      "doctor",
      "optometry",
      "vision",
    ],
    names: ["health", "medical", "pharmacy", "doctor"],
    reason: "Looks like health care",
    kind: "expense",
  },
  {
    words: [
      "electric",
      "power",
      "energy",
      "water",
      "utility",
      "utilities",
      "internet",
      "comcast",
      "xfinity",
      "verizon",
      "att",
      "tmobile",
      "spectrum",
      "wireless",
    ],
    names: ["utilit", "internet", "phone", "bill"],
    reason: "Looks like a utility or phone bill",
    kind: "expense",
  },
  {
    words: ["insurance", "geico", "progressive", "allstate", "state farm", "lemonade"],
    names: ["insurance"],
    reason: "Looks like insurance",
    kind: "expense",
  },
  {
    words: ["rent", "apartment", "apartments", "leasing", "property management"],
    names: ["rent", "housing", "mortgage"],
    reason: "Looks like rent",
    kind: "expense",
  },
  {
    words: ["gym", "fitness", "yoga", "climbing"],
    names: ["fitness", "gym", "health"],
    reason: "Looks like a gym",
    kind: "expense",
  },
  {
    words: ["petco", "petsmart", "vet", "veterinary", "chewy"],
    names: ["pet"],
    reason: "Looks like pet care",
    kind: "expense",
  },
  {
    words: [
      "amazon",
      "target",
      "walmart",
      "ebay",
      "etsy",
      "best buy",
      "home depot",
      "lowes",
      "ikea",
    ],
    names: ["shopping", "household", "home"],
    reason: "Looks like shopping",
    kind: "expense",
  },
];

/** Days between two YYYY-MM-DD dates. */
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const CADENCES: ReadonlyArray<{ every: Repeats["every"]; days: number; slack: number }> = [
  { every: "week", days: 7, slack: 1 },
  { every: "two weeks", days: 14, slack: 2 },
  { every: "month", days: 30.4, slack: 4 },
  { every: "year", days: 365, slack: 10 },
];

/**
 * Whether a group repeats on a schedule for about the same amount: at least three
 * times, with most gaps, and nearly all amounts, close to the usual ones. Weekly
 * shopping trips vary too much to count.
 */
export function findRepeats(
  rows: ReadonlyArray<{ date: string; amountCents: number }>,
): Repeats | null {
  if (rows.length < 3) return null;
  const dates = rows.map((row) => row.date).sort();
  const gaps = dates.slice(1).map((date, index) => daysBetween(dates[index] ?? date, date));
  const usual = median(gaps);
  const cadence = CADENCES.find((entry) => Math.abs(usual - entry.days) <= entry.slack);
  if (!cadence) return null;
  const onTime = gaps.filter((gap) => Math.abs(gap - cadence.days) <= cadence.slack).length;
  const amounts = rows.map((row) => Math.abs(row.amountCents));
  const typical = median(amounts);
  const steady = amounts.filter((amount) => Math.abs(amount - typical) <= typical * 0.15).length;
  if (onTime / gaps.length < 2 / 3 || steady / amounts.length < 0.8) return null;
  return { every: cadence.every, typicalCents: Math.round(typical) };
}

/** A category that fits money in or out: income for money in, spending for money out. */
const fitsKind = (category: CategoryOption, direction: TransactionGroup["direction"]) =>
  direction === "any" ||
  (direction === "in" ? category.kind === "income" : category.kind === "expense");

/** How many of each category, most first. */
function tally(ids: readonly number[]) {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function wordSimilarity(a: readonly string[], b: readonly string[]) {
  if (a.length === 0 || b.length === 0 || a[0] !== b[0]) return 0;
  const left = new Set(a);
  const right = new Set(b);
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / new Set([...left, ...right]).size;
}

type HistoryGroup = { name: string; words: string[]; categories: number[] };

function suggest(
  group: Omit<TransactionGroup, "suggestion">,
  pending: readonly PendingTransaction[],
  history: Map<string, HistoryGroup>,
  categories: ReadonlyMap<number, CategoryOption>,
  rules: readonly RuleLike[],
): Suggestion | null {
  const usable = (id: number) => {
    const category = categories.get(id);
    return category !== undefined && !category.archived;
  };
  const name = (id: number) => categories.get(id)?.name ?? "";

  // 1. A rule the person made.
  const ruled = pending
    .map((row) => matchRule(rules, row))
    .filter((rule): rule is RuleLike => rule !== null && usable(rule.categoryId));
  const [firstRule] = ruled;
  if (firstRule && ruled.length === pending.length) {
    return {
      categoryId: firstRule.categoryId,
      confidence: "high",
      reason: `Your rule for “${firstRule.contains}” puts these in ${name(firstRule.categoryId)}`,
    };
  }

  // 2. The same merchant or person, categorized before.
  const same = history.get(group.key);
  const counted = same ? tally(same.categories).filter(([id]) => usable(id)) : [];
  const [top] = counted;
  if (same && top) {
    const [id, n] = top;
    const total = counted.reduce((sum, [, count]) => sum + count, 0);
    const share = n / total;
    if (share >= 0.6) {
      return {
        categoryId: id,
        confidence: n >= 2 && share >= 0.8 ? "high" : "medium",
        reason:
          total === 1
            ? `You put another one like this in ${name(id)}`
            : n === total
              ? `You put all ${total} like this in ${name(id)}`
              : `You put ${n} of ${total} like this in ${name(id)}`,
      };
    }
  }

  // 3. A similar name: "Corner Grocery Market" for "Corner Grocery", or the same person
  // on another app.
  if (group.key.startsWith("person:")) {
    const person = group.key.split(":").slice(2).join(":");
    for (const [key, other] of history) {
      if (key === group.key || !key.startsWith("person:") || !key.endsWith(`:${person}`)) continue;
      const [best] = tally(other.categories).filter(([id]) => usable(id));
      if (best) {
        return {
          categoryId: best[0],
          confidence: "medium",
          reason: `You put other payments with ${group.ruleText} in ${name(best[0])}`,
        };
      }
    }
    return null;
  }
  const words = group.key.startsWith("merchant:")
    ? merchantWords(pending[0]?.payee ?? "").slice(0, 4)
    : [];
  let closest: { other: HistoryGroup; similarity: number; id: number } | null = null;
  for (const [key, other] of history) {
    if (key === group.key || !key.startsWith("merchant:")) continue;
    const similarity = wordSimilarity(words, other.words);
    const [best] = tally(other.categories).filter(
      ([id]) => usable(id) && fitsKind(categories.get(id) as CategoryOption, group.direction),
    );
    if (best && similarity >= 0.5 && (!closest || similarity > closest.similarity)) {
      closest = { other, similarity, id: best[0] };
    }
  }
  if (closest) {
    return {
      categoryId: closest.id,
      confidence: closest.similarity >= 0.66 ? "medium" : "low",
      reason: `Similar to ${closest.other.name}, which you put in ${name(closest.id)}`,
    };
  }

  // 4. Common words, if the book has a category by a matching name.
  const text = ` ${pending.flatMap((row) => merchantWords(row.payee)).join(" ")} `;
  const options = [...categories.values()].filter(
    (category) => !category.archived && fitsKind(category, group.direction),
  );
  for (const hint of HINTS) {
    if (group.direction !== "any" && (hint.kind === "income") !== (group.direction === "in"))
      continue;
    if (!hint.words.some((word) => text.includes(` ${word} `))) continue;
    const match = hint.names
      .map((part) => options.find((category) => category.name.toLowerCase().includes(part)))
      .find((category) => category !== undefined);
    if (match) return { categoryId: match.id, confidence: "low", reason: hint.reason };
  }
  if (group.repeats && group.direction === "out") {
    const match = options.find((category) => /subscription|bill/i.test(category.name));
    if (match) {
      return {
        categoryId: match.id,
        confidence: "low",
        reason: `Charged about every ${group.repeats.every}`,
      };
    }
  }
  return null;
}

/**
 * Uncategorized transactions in groups of similar ones, biggest first, each with a
 * suggested category when there's a reason for one.
 */
export function buildGroups(
  pending: readonly PendingTransaction[],
  categorized: readonly CategorizedTransaction[],
  categoryList: readonly CategoryOption[],
  rules: readonly RuleLike[] = [],
): TransactionGroup[] {
  const categories = new Map(categoryList.map((category) => [category.id, category]));
  const history = new Map<string, HistoryGroup>();
  for (const row of categorized) {
    const group = payeeGroup(row);
    const entry = history.get(group.key) ?? {
      name: group.name,
      words: group.key.startsWith("merchant:") ? merchantWords(row.payee).slice(0, 4) : [],
      categories: [],
    };
    entry.categories.push(row.categoryId);
    history.set(group.key, entry);
  }

  const byKey = new Map<
    string,
    { group: ReturnType<typeof payeeGroup>; rows: PendingTransaction[] }
  >();
  for (const row of pending) {
    const group = payeeGroup(row);
    const entry = byKey.get(group.key) ?? { group, rows: [] };
    entry.rows.push(row);
    byKey.set(group.key, entry);
  }

  const groups = [...byKey.values()].map(({ group, rows }) => {
    const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const out = rows.some((row) => row.amountCents < 0);
    const into = rows.some((row) => row.amountCents > 0);
    const base = {
      ...group,
      direction: out && into ? ("any" as const) : into ? ("in" as const) : ("out" as const),
      transactionIds: sorted.map((row) => row.id),
      inCents: rows.reduce((sum, row) => sum + Math.max(0, row.amountCents), 0),
      outCents: rows.reduce((sum, row) => sum + Math.max(0, -row.amountCents), 0),
      firstDate: sorted.at(-1)?.date ?? "",
      lastDate: sorted[0]?.date ?? "",
      examples: sorted.slice(0, EXAMPLES),
      repeats: findRepeats(rows),
    };
    return { ...base, suggestion: suggest(base, rows, history, categories, rules) };
  });
  return groups.sort(
    (a, b) =>
      b.transactionIds.length - a.transactionIds.length ||
      b.outCents + b.inCents - (a.outCents + a.inCents) ||
      a.name.localeCompare(b.name),
  );
}

/** "Every month, about $15.99" */
export function repeatsText(repeats: Repeats, format: (cents: number) => string): string {
  return `Every ${repeats.every}, about ${format(repeats.typicalCents)}`;
}

// Requests

const id = z.number().int().positive();

export const categorizeQuerySchema = z.object({ bookId: z.coerce.number().int().positive() });

/** Puts transactions in a category, maybe renaming them and making a rule for more. */
export const categorizeApplySchema = z
  .object({
    bookId: id,
    transactionIds: z.array(id).min(1, "Pick at least one transaction.").max(5_000),
    categoryId: id,
    /** A cleaner payee for all of them, or "" to keep each as it is. */
    renameTo: z.string().trim().max(200, "Keep payees under 200 characters.").default(""),
    rule: ruleMatchSchema.optional(),
  })
  .strict();
export type CategorizeApply = z.input<typeof categorizeApplySchema>;

export const fillPeopleSchema = z.object({ bookId: id }).strict();
