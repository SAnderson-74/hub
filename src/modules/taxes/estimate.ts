import { formatCents } from "../../shared/money";

// A resale year's income, and a rough amount to set aside for federal tax on it.
// Education, not tax advice: it leaves out deductions, credits, other income, and
// state and local taxes. Rates are from the sources in lessons.ts.

/** What the summary needs from a resale item. Money is in cents. */
export type TaxItem = {
  status: string;
  purchasedOn: string | null;
  purchaseCents: number | null;
  soldOn: string | null;
  saleCents: number | null;
  costsCents: number;
};

export type ResaleYear = {
  year: number;
  /** Items sold in the year with a sale price. */
  sold: number;
  salesCents: number;
  /** What was paid for the items sold. */
  itemCostCents: number;
  /** Fees, shipping, parts, and supplies recorded on the items sold. */
  otherCostCents: number;
  profitCents: number;
  /** Sold items counted with a $0 purchase price, so profit may be overstated. */
  unpriced: number;
  /** Marked sold in the year with no sale price, so left out. */
  missingSalePrice: number;
  /** Marked sold with no sale date, so in no year. */
  undated: number;
  /** Bought in the year and not sold: inventory, whose cost counts when it sells. */
  onHand: number;
  onHandCents: number;
};

const inYear = (date: string | null, year: number) => date?.slice(0, 4) === String(year);

export function resaleYear(items: readonly TaxItem[], year: number): ResaleYear {
  const summary: ResaleYear = {
    year,
    sold: 0,
    salesCents: 0,
    itemCostCents: 0,
    otherCostCents: 0,
    profitCents: 0,
    unpriced: 0,
    missingSalePrice: 0,
    undated: 0,
    onHand: 0,
    onHandCents: 0,
  };
  for (const item of items) {
    if (item.status === "sold") {
      if (item.soldOn === null) summary.undated += 1;
      else if (!inYear(item.soldOn, year)) continue;
      else if (item.saleCents === null) summary.missingSalePrice += 1;
      else {
        summary.sold += 1;
        summary.salesCents += item.saleCents;
        summary.itemCostCents += item.purchaseCents ?? 0;
        summary.otherCostCents += item.costsCents;
        if (item.purchaseCents === null) summary.unpriced += 1;
      }
    } else if (inYear(item.purchasedOn, year)) {
      summary.onHand += 1;
      summary.onHandCents += (item.purchaseCents ?? 0) + item.costsCents;
    }
  }
  summary.profitCents = summary.salesCents - summary.itemCostCents - summary.otherCostCents;
  return summary;
}

/** Years with a sale, plus the current one, newest first. */
export function resaleYears(items: readonly TaxItem[], currentYear: number): number[] {
  const years = new Set([currentYear]);
  for (const item of items) {
    const year = Number(item.soldOn?.slice(0, 4));
    if (item.status === "sold" && year > 0) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

/** Federal income tax rates (2026). Pick the top one your income reaches. */
export const TAX_BRACKETS = [10, 12, 22, 24, 32, 35, 37] as const;
export type TaxBracket = (typeof TAX_BRACKETS)[number];

const SE_RATE = 0.153;
const SE_EARNINGS_SHARE = 0.9235;
const SE_MINIMUM_CENTS = 400_00;

/** Wages and self-employment earnings past this owe no Social Security tax. */
export const SOCIAL_SECURITY_WAGE_BASE_CENTS: Record<number, number> = {
  2025: 176_100_00,
  2026: 184_500_00,
};

export type SetAside = {
  selfEmploymentCents: number;
  incomeTaxCents: number;
  totalCents: number;
  /** The total as a share of profit, like 0.3. null without profit. */
  share: number | null;
  /** Net earnings were under $400, so no self-employment tax. */
  underMinimum: boolean;
  /** Earnings pass the year's Social Security limit, so this runs high. */
  overWageBase: boolean;
};

/**
 * A rough federal amount to set aside for a year's profit: self-employment tax
 * (15.3% of 92.35% of profit, from $400 of net earnings), plus income tax at your
 * bracket on profit less half the self-employment tax.
 */
export function setAside(profitCents: number, bracket: TaxBracket, year: number): SetAside {
  if (profitCents <= 0) {
    return {
      selfEmploymentCents: 0,
      incomeTaxCents: 0,
      totalCents: 0,
      share: null,
      underMinimum: false,
      overWageBase: false,
    };
  }
  const earningsCents = Math.round(profitCents * SE_EARNINGS_SHARE);
  const underMinimum = earningsCents < SE_MINIMUM_CENTS;
  const selfEmploymentCents = underMinimum ? 0 : Math.round(earningsCents * SE_RATE);
  const incomeTaxCents = Math.round(((profitCents - selfEmploymentCents / 2) * bracket) / 100);
  const totalCents = selfEmploymentCents + incomeTaxCents;
  const wageBase =
    SOCIAL_SECURITY_WAGE_BASE_CENTS[year] ??
    SOCIAL_SECURITY_WAGE_BASE_CENTS[
      Math.max(...Object.keys(SOCIAL_SECURITY_WAGE_BASE_CENTS).map(Number))
    ];
  return {
    selfEmploymentCents,
    incomeTaxCents,
    totalCents,
    share: totalCents / profitCents,
    underMinimum,
    overWageBase: wageBase !== undefined && earningsCents > wageBase,
  };
}

/** Estimated payment due dates for a tax year, as YYYY-MM-DD. */
export function estimatedTaxDates(year: number): string[] {
  return [`${year}-04-15`, `${year}-06-15`, `${year}-09-15`, `${year + 1}-01-15`];
}

/** Estimates show whole dollars: "$1,240". */
export const aboutDollars = (cents: number) => formatCents(Math.round(cents / 100) * 100);

/** "Set aside about $1,240 (31% of profit)." */
export function setAsideSummary(result: SetAside): string {
  if (result.share === null) return "No profit, so nothing to set aside.";
  return `Set aside about ${aboutDollars(result.totalCents)} (${Math.round(result.share * 100)}% of profit).`;
}
