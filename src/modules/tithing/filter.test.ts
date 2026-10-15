import { describe, expect, it } from "vitest";
import { filterIncome, noTithingFilter, type TithingFilter, tithingFilterCount } from "./filter";

const row = (
  id: number,
  date: string,
  amountCents: number,
  payee: string,
  source = "Paycheck",
) => ({
  id,
  date,
  amountCents,
  payee,
  source,
  account: { name: "Checking" },
});
const rows = [
  row(1, "2029-12-15", 100_000, "Example Employer"),
  row(2, "2030-01-15", 200_000, "Example Employer"),
  row(3, "2030-02-10", 90_000, "Local classifieds sale", "Resale"),
  row(4, "2030-03-01", 1_840, "Bank interest", "Interest"),
];
const ids = (list: Array<{ id: number }>) => list.map((entry) => entry.id);
const filter = (patch: Partial<TithingFilter>, lists: Partial<TithingFilter["lists"]> = {}) => ({
  ...noTithingFilter,
  ...patch,
  lists: { ...noTithingFilter.lists, ...lists },
});

describe("Tithing filters", () => {
  it("show the year chosen unless dates are picked", () => {
    expect(ids(filterIncome(rows, noTithingFilter, 2030))).toEqual([4, 3, 2]);
    expect(ids(filterIncome(rows, noTithingFilter, null))).toEqual([4, 3, 2, 1]);
    const picked = filter({ datesPicked: true }, { from: "2029-12-01", to: "2030-01-31" });
    expect(ids(filterIncome(rows, picked, 2030))).toEqual([2, 1]);
    // Picked and left open: all time.
    expect(ids(filterIncome(rows, filter({ datesPicked: true }), 2030))).toEqual([4, 3, 2, 1]);
  });

  it("sort by date or size", () => {
    expect(ids(filterIncome(rows, filter({ sort: "oldest" }), null))).toEqual([1, 2, 3, 4]);
    expect(ids(filterIncome(rows, filter({ sort: "largest" }), null))).toEqual([2, 1, 3, 4]);
    expect(ids(filterIncome(rows, filter({ sort: "smallest" }), null))).toEqual([4, 3, 1, 2]);
  });

  it("keep to a range of amounts and to sources", () => {
    expect(
      ids(filterIncome(rows, filter({}, { minDollars: 950, maxDollars: 1_500 }), null)),
    ).toEqual([1]);
    expect(
      ids(filterIncome(rows, filter({}, { categories: ["Resale", "Interest"] }), null)),
    ).toEqual([4, 3]);
  });

  it("search by payee, source, or account, every word", () => {
    expect(ids(filterIncome(rows, filter({ q: "employer" }), null))).toEqual([2, 1]);
    expect(ids(filterIncome(rows, filter({ q: "resale sale" }), null))).toEqual([3]);
    expect(ids(filterIncome(rows, filter({ q: "checking interest" }), null))).toEqual([4]);
    expect(ids(filterIncome(rows, filter({ q: "nothing here" }), null))).toEqual([]);
  });

  it("count the filters in the sheet", () => {
    expect(tithingFilterCount(noTithingFilter)).toBe(0);
    expect(
      tithingFilterCount(filter({ datesPicked: true }, { minDollars: 1, categories: ["Resale"] })),
    ).toBe(3);
  });
});
