// Money is stored as integer cents everywhere (see CLAUDE.md) and shown in dollars.

const whole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const exact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$1,250" for whole dollars, "$1,250.50" otherwise. */
export function formatCents(cents: number): string {
  return cents % 100 === 0 ? whole.format(cents / 100) : exact.format(cents / 100);
}

/**
 * Cents from what someone typed, like "1,250", "$1250.5", or "0.99". Returns null
 * for anything that isn't a non-negative amount with at most two decimals.
 */
export function parseDollars(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, "").replaceAll(",", "").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match?.[1]) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Cents as an editable dollar string, like "1250" or "1250.50". */
export function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** Like parseDollars, but a leading minus sign makes it negative: "-250" is -25000. */
export function parseSignedDollars(input: string): number | null {
  const trimmed = input.trim();
  const negative = /^[-−]/.test(trimmed);
  const cents = parseDollars(negative ? trimmed.slice(1) : trimmed);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

/** Signed cents as an editable string, like "-250" or "1250.50". */
export function signedCentsToInput(cents: number): string {
  return cents < 0 ? `-${centsToInput(-cents)}` : centsToInput(cents);
}
