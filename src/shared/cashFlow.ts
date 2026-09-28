import { z } from "zod";
import { monthSchema } from "./budget";
import { formatCents } from "./money";

// Cash flow: where a book's money came from and where it went over a period, for a
// chart that runs from money in, through the total, out to spending. Transfers
// between accounts are neither, so they're left out.

/** How many months, ending with the chosen one, the chart covers. */
export const CASH_FLOW_PERIODS = [1, 3, 12] as const;
export type CashFlowPeriod = (typeof CASH_FLOW_PERIODS)[number];

export const cashFlowQuerySchema = z.object({
  bookId: z.coerce.number().int().positive(),
  month: monthSchema,
  months: z.coerce
    .number()
    .pipe(z.union([z.literal(1), z.literal(3), z.literal(12)]))
    .default(1),
});

/** A category's net, or uncategorized money in or out. `cents` is always positive. */
export type CashFlowItem = { key: string; name: string; cents: number };

export type CashFlowJson = {
  /** First and last dates covered. */
  from: string;
  to: string;
  /** Biggest first. */
  incoming: CashFlowItem[];
  outgoing: CashFlowItem[];
};

export type FlowRole = "in" | "out" | "drawn" | "left";

export type FlowNode = CashFlowItem & { role: FlowRole };

export type FlowColumns = {
  sources: FlowNode[];
  sinks: FlowNode[];
  /** Both sides add up to this, once balanced. */
  totalCents: number;
  inCents: number;
  outCents: number;
};

/** Keeps the biggest items and folds the rest into one, so labels stay readable. */
function fold(items: readonly CashFlowItem[], max: number, key: string, name: string) {
  if (items.length <= max) return [...items];
  const kept = items.slice(0, max - 1);
  const rest = items.slice(max - 1).reduce((sum, item) => sum + item.cents, 0);
  return [...kept, { key, name, cents: rest }];
}

const sum = (items: readonly CashFlowItem[]) =>
  items.reduce((total, item) => total + item.cents, 0);

/**
 * The chart's two sides. When more went out than came in, the difference came from
 * account balances; when less did, it was left over. Either way both sides match.
 */
export function flowColumns(flow: CashFlowJson, maxIn = 5, maxOut = 8): FlowColumns {
  const inCents = sum(flow.incoming);
  const outCents = sum(flow.outgoing);
  const sources: FlowNode[] = fold(flow.incoming, maxIn, "other-in", "Other money in").map(
    (item) => ({ ...item, role: "in" }),
  );
  const sinks: FlowNode[] = fold(flow.outgoing, maxOut, "other-out", "Other spending").map(
    (item) => ({ ...item, role: "out" }),
  );
  if (outCents > inCents) {
    sources.push({
      key: "drawn",
      name: "From account balances",
      cents: outCents - inCents,
      role: "drawn",
    });
  } else if (inCents > outCents) {
    sinks.push({ key: "left", name: "Left over", cents: inCents - outCents, role: "left" });
  }
  return { sources, sinks, totalCents: Math.max(inCents, outCents), inCents, outCents };
}

/** The chart's one-line summary. */
export function flowSummary(columns: FlowColumns, period: string): string {
  const { inCents, outCents, sinks } = columns;
  if (inCents === 0 && outCents === 0) return `No money came in or went out in ${period}.`;
  const balance =
    inCents > outCents
      ? `, leaving ${formatCents(inCents - outCents)}`
      : outCents > inCents
        ? `, ${formatCents(outCents - inCents)} more than came in`
        : "";
  const biggest = sinks.find((node) => node.role === "out" && node.key !== "other-out");
  return `In ${period}, ${formatCents(inCents)} came in and ${formatCents(outCents)} went out${balance}.${
    biggest ? ` The most went to ${biggest.name}, ${formatCents(biggest.cents)}.` : ""
  }`;
}

/** "September 2026", or "the 3 months to September 2026". */
export function periodLabel(month: string, months: CashFlowPeriod): string {
  const [year = 0, index = 1] = month.split("-").map(Number);
  const name = new Date(Date.UTC(year, index - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return months === 1 ? name : `the ${months} months to ${name}`;
}
