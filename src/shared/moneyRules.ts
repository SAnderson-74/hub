// Categorization rules and transfer matching: pure logic shared by the server (imports,
// applying rules) and the browser (suggesting a category while typing a payee).

export const RULE_DIRECTIONS = ["any", "out", "in"] as const;
export type RuleDirection = (typeof RULE_DIRECTIONS)[number];

export const RULE_DIRECTION_LABELS: Record<RuleDirection, string> = {
  any: "Money in or out",
  out: "Money out",
  in: "Money in",
};

export type RuleLike = {
  /**
   * Matched anywhere in the payee (or the person a payment-app transaction was with),
   * ignoring case, and also ignoring punctuation: "trader joes" fits "TRADER JOE'S".
   */
  contains: string;
  direction: RuleDirection;
  categoryId: number;
  /** A cleaner payee name to use, or "" to keep the payee as it is. */
  renameTo: string;
};

/** Lowercase letters, digits, and single spaces: "SQ *Joe's" is "sq joes". */
const loose = (text: string) =>
  text
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();

/** The first rule (in order) that fits a transaction, or null. */
export function matchRule<R extends RuleLike>(
  rules: readonly R[],
  transaction: { payee: string; amountCents: number; counterparty?: string | null },
): R | null {
  const text = [transaction.payee, transaction.counterparty ?? ""].join(" ").toLowerCase();
  const looseText = ` ${loose(text)} `;
  for (const rule of rules) {
    const needle = rule.contains.trim().toLowerCase();
    if (needle === "") continue;
    const looseNeedle = loose(needle);
    if (!text.includes(needle) && (looseNeedle === "" || !looseText.includes(looseNeedle))) {
      continue;
    }
    if (rule.direction === "out" && transaction.amountCents >= 0) continue;
    if (rule.direction === "in" && transaction.amountCents <= 0) continue;
    return rule;
  }
  return null;
}

/** How far apart the two sides of a transfer can be dated, since banks post on different days. */
export const TRANSFER_WINDOW_DAYS = 4;

export type TransferCandidate = {
  id: number;
  accountId: number;
  date: string;
  amountCents: number;
};

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/**
 * Pairs money leaving one account with the same amount arriving in another within a
 * few days. Each transaction is used once; the closest dates pair first, then the
 * earliest. Returns [out, in] pairs, oldest first.
 */
export function findTransferPairs<T extends TransferCandidate>(
  rows: readonly T[],
  windowDays = TRANSFER_WINDOW_DAYS,
): Array<[T, T]> {
  const incoming = new Map<number, T[]>();
  for (const row of rows) {
    if (row.amountCents > 0) {
      incoming.set(row.amountCents, [...(incoming.get(row.amountCents) ?? []), row]);
    }
  }
  const options: Array<{ out: T; into: T; gap: number }> = [];
  for (const out of rows) {
    if (out.amountCents >= 0) continue;
    for (const into of incoming.get(-out.amountCents) ?? []) {
      if (into.accountId === out.accountId) continue;
      const gap = Math.abs(dayNumber(into.date) - dayNumber(out.date));
      if (gap <= windowDays) options.push({ out, into, gap });
    }
  }
  options.sort(
    (a, b) =>
      a.gap - b.gap ||
      (a.out.date < b.out.date ? -1 : a.out.date > b.out.date ? 1 : 0) ||
      a.out.id - b.out.id ||
      a.into.id - b.into.id,
  );
  const used = new Set<number>();
  const pairs: Array<[T, T]> = [];
  for (const { out, into } of options) {
    if (used.has(out.id) || used.has(into.id)) continue;
    used.add(out.id);
    used.add(into.id);
    pairs.push([out, into]);
  }
  return pairs.sort(([a], [b]) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.id - b.id);
}
