import {
  compareFor,
  inAmountRange,
  inDateRange,
  type ListFilters,
  matchesWords,
  type Sort,
} from "../../shared/listFilter";

/** What the Tithing lists are narrowed to and how they're ordered. */
export type TithingFilter = {
  q: string;
  sort: Sort;
  /** The filters shared with Money. `from` and `to` of "" mean all time. */
  lists: ListFilters;
  /** Whether dates were picked; otherwise the income list shows the year chosen on the page. */
  datesPicked: boolean;
};

export const noTithingFilter: TithingFilter = {
  q: "",
  sort: "newest",
  lists: { from: "", to: "", minDollars: null, maxDollars: null, categories: [] },
  datesPicked: false,
};

type Row = {
  id: number;
  date: string;
  payee: string;
  source: string;
  amountCents: number;
  account: { name: string };
};

/**
 * Narrows and orders income rows. Without dates picked, `defaultYear` limits them to
 * that year (null for no limit, as the unpaid list wants). Categories are the sources
 * income came from. Amounts are compared by size.
 */
export function filterIncome<T extends Row>(
  rows: readonly T[],
  filter: TithingFilter,
  defaultYear: number | null,
): T[] {
  const { lists } = filter;
  const from = filter.datesPicked ? lists.from : defaultYear ? `${defaultYear}-01-01` : "";
  const to = filter.datesPicked ? lists.to : defaultYear ? `${defaultYear}-12-31` : "";
  return rows
    .filter(
      (row) =>
        inDateRange(row.date, from || null, to || null) &&
        inAmountRange(
          row.amountCents,
          lists.minDollars === null ? null : lists.minDollars * 100,
          lists.maxDollars === null ? null : lists.maxDollars * 100,
        ) &&
        (lists.categories.length === 0 || lists.categories.includes(row.source)) &&
        matchesWords(`${row.payee} ${row.source} ${row.account.name}`, filter.q),
    )
    .sort(compareFor(filter.sort));
}

/** How many of the sheet's filters are in use, counting dates only when picked. */
export const tithingFilterCount = (filter: TithingFilter): number =>
  (filter.datesPicked ? 1 : 0) +
  (filter.lists.minDollars !== null || filter.lists.maxDollars !== null ? 1 : 0) +
  (filter.lists.categories.length > 0 ? 1 : 0);
