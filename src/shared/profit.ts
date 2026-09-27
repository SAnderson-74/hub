import { formatCents } from "./money";

/** What profit needs from an item. Money is in cents. */
export type ProfitInput = {
  id: number;
  status: string;
  soldOn: string | null;
  saleCents: number | null;
  purchaseCents: number | null;
  costsCents: number;
  timeMinutes: number;
  salePlatform: { id: number; name: string } | null;
};

export type ItemProfit = {
  saleCents: number;
  /** Price paid plus costs. A missing price counts as $0 (see `unpriced`). */
  spentCents: number;
  profitCents: number;
  /** Profit as a share of the sale price, like 0.4. null for a $0 sale. */
  margin: number | null;
  /** Profit per hour of logged time, in cents. null without logged time. */
  perHourCents: number | null;
  /** No purchase price was recorded, so profit may be overstated. */
  unpriced: boolean;
};

/** Profit for a sold item with a sale price, otherwise null. */
export function itemProfit(item: ProfitInput): ItemProfit | null {
  if (item.status !== "sold" || item.saleCents === null) return null;
  const spentCents = (item.purchaseCents ?? 0) + item.costsCents;
  const profitCents = item.saleCents - spentCents;
  return {
    saleCents: item.saleCents,
    spentCents,
    profitCents,
    margin: item.saleCents > 0 ? profitCents / item.saleCents : null,
    perHourCents: item.timeMinutes > 0 ? Math.round(profitCents / (item.timeMinutes / 60)) : null,
    unpriced: item.purchaseCents === null,
  };
}

export type ProfitTotals = {
  sales: number;
  saleCents: number;
  profitCents: number;
  margin: number | null;
  /** From sold items with logged time only, so untimed sales don't inflate it. */
  perHourCents: number | null;
  timedSales: number;
  /** Sold items left out because they have no sale price. */
  missingSalePrice: number;
  /** Sold items counted with a $0 purchase price. */
  unpriced: number;
};

export function profitTotals(items: readonly ProfitInput[]): ProfitTotals {
  let sales = 0;
  let saleCents = 0;
  let profitCents = 0;
  let timedProfit = 0;
  let timedMinutes = 0;
  let timedSales = 0;
  let unpriced = 0;
  let missingSalePrice = 0;
  for (const item of items) {
    if (item.status !== "sold") continue;
    const profit = itemProfit(item);
    if (!profit) {
      missingSalePrice += 1;
      continue;
    }
    sales += 1;
    saleCents += profit.saleCents;
    profitCents += profit.profitCents;
    if (profit.unpriced) unpriced += 1;
    if (item.timeMinutes > 0) {
      timedSales += 1;
      timedProfit += profit.profitCents;
      timedMinutes += item.timeMinutes;
    }
  }
  return {
    sales,
    saleCents,
    profitCents,
    margin: saleCents > 0 ? profitCents / saleCents : null,
    perHourCents: timedMinutes > 0 ? Math.round(timedProfit / (timedMinutes / 60)) : null,
    timedSales,
    missingSalePrice,
    unpriced,
  };
}

export type MonthProfit = {
  /** YYYY-MM */
  month: string;
  sales: number;
  saleCents: number;
  profitCents: number;
};

/** The `count` months ending with `endMonth` (YYYY-MM), oldest first, empty months included. */
export function profitByMonth(
  items: readonly ProfitInput[],
  endMonth: string,
  count = 12,
): MonthProfit[] {
  const [year = 0, month = 1] = endMonth.split("-").map(Number);
  const months: MonthProfit[] = Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    return {
      month: date.toISOString().slice(0, 7),
      sales: 0,
      saleCents: 0,
      profitCents: 0,
    };
  });
  const byMonth = new Map(months.map((entry) => [entry.month, entry]));
  for (const item of items) {
    const profit = itemProfit(item);
    const entry = item.soldOn ? byMonth.get(item.soldOn.slice(0, 7)) : undefined;
    if (!profit || !entry) continue;
    entry.sales += 1;
    entry.saleCents += profit.saleCents;
    entry.profitCents += profit.profitCents;
  }
  return months;
}

export type PlatformProfit = {
  name: string;
  sales: number;
  saleCents: number;
  profitCents: number;
  margin: number | null;
};

/** Profit per platform sold on, most profitable first. Sales without one are "No platform". */
export function profitByPlatform(items: readonly ProfitInput[]): PlatformProfit[] {
  const groups = new Map<string, PlatformProfit>();
  for (const item of items) {
    const profit = itemProfit(item);
    if (!profit) continue;
    const name = item.salePlatform?.name ?? "No platform";
    const group = groups.get(name) ?? {
      name,
      sales: 0,
      saleCents: 0,
      profitCents: 0,
      margin: null,
    };
    group.sales += 1;
    group.saleCents += profit.saleCents;
    group.profitCents += profit.profitCents;
    group.margin = group.saleCents > 0 ? group.profitCents / group.saleCents : null;
    groups.set(name, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.profitCents - a.profitCents || a.name.localeCompare(b.name),
  );
}

/** "40%", or "-12%" for a loss. */
export function formatMargin(margin: number | null): string {
  if (margin === null) return "No margin";
  // Round the size, then add the sign, so a loss rounds like a gain (-12.5% is -13%).
  const percent = Math.round(Math.abs(margin) * 100);
  return margin < 0 && percent > 0 ? `-${percent}%` : `${percent}%`;
}

/** "$34/h" */
export function formatPerHour(cents: number | null): string {
  return cents === null ? "No time logged" : `${formatSigned(cents)}/h`;
}

/** "$85", or "-$12" for a loss. */
export function formatSigned(cents: number): string {
  return cents < 0 ? `-${formatCents(-cents)}` : formatCents(cents);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Aug" or "Aug 2029" from YYYY-MM. */
export function monthLabel(month: string, withYear = false): string {
  const [year, index = 1] = month.split("-").map(Number);
  const name = MONTHS[index - 1] ?? month;
  return withYear ? `${name} ${year}` : name;
}

/** The monthly chart's one-line summary. */
export function monthSummary(months: readonly MonthProfit[]): string {
  const sold = months.filter((entry) => entry.sales > 0);
  if (sold.length === 0) return "No sales in the last 12 months.";
  const total = months.reduce((sum, entry) => sum + entry.profitCents, 0);
  const best = sold.reduce((top, entry) => (entry.profitCents > top.profitCents ? entry : top));
  const losses = sold.filter((entry) => entry.profitCents < 0).length;
  return [
    `${formatSigned(total)} profit over the last ${months.length} months, best in ${monthLabel(best.month, true)} (${formatSigned(best.profitCents)}).`,
    losses > 0 ? `${losses} ${losses === 1 ? "month" : "months"} at a loss.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The platform chart's one-line summary. */
export function platformSummary(platforms: readonly PlatformProfit[]): string {
  const [top] = platforms;
  if (!top) return "No sales yet.";
  const sales = `${top.sales} ${top.sales === 1 ? "sale" : "sales"}`;
  if (platforms.length === 1)
    return `All profit so far is from ${top.name}: ${formatSigned(top.profitCents)} from ${sales}.`;
  return `Most profit on ${top.name}: ${formatSigned(top.profitCents)} from ${sales}.`;
}
