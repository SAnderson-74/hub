import { SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";
import { CheckList } from "../../../client/components/CheckList";
import { DateRangeFields } from "../../../client/components/DateRangeFields";
import { RangeSlider } from "../../../client/components/RangeSlider";
import { Sheet } from "../../../client/components/Sheet";
import {
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { SORT_LABELS, SORTS, type Sort, sliderMax } from "../../../shared/listFilter";
import { noTithingFilter, type TithingFilter, tithingFilterCount } from "../filter";

/** Search and sort, and a sheet for dates, a range of amounts, and sources. */
export function FilterBar({
  filter,
  onChange,
  sources,
  largestCents,
  today,
  year,
  shown,
}: {
  filter: TithingFilter;
  onChange: (filter: TithingFilter) => void;
  /** The places income came from, as category names. */
  sources: string[];
  largestCents: number;
  today: string;
  /** The year the page shows when no dates are picked. */
  year: number;
  /** How many income rows match, for the sheet's button. */
  shown: number;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const count = tithingFilterCount(filter);
  const active = count > 0 || filter.q !== "" || filter.sort !== "newest";
  const dates = filter.datesPicked
    ? filter.lists
    : { ...filter.lists, from: `${year}-01-01`, to: `${year}-12-31` };

  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${ids}-search`} className={labelClass}>
            Search
          </label>
          <input
            id={`${ids}-search`}
            type="search"
            value={filter.q}
            onChange={(event) => onChange({ ...filter, q: event.target.value })}
            placeholder="Payee, source, or account"
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-sort`} className={labelClass}>
            Sort by
          </label>
          <select
            id={`${ids}-sort`}
            value={filter.sort}
            onChange={(event) => onChange({ ...filter, sort: event.target.value as Sort })}
            className={inputClass}
          >
            {SORTS.map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={secondaryButton} onClick={() => setOpen(true)}>
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          {count > 0 ? `More filters (${count})` : "More filters"}
        </button>
        {active ? (
          <button type="button" className={ghostButton} onClick={() => onChange(noTithingFilter)}>
            Clear filters
          </button>
        ) : null}
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filter income"
        description="Narrow income by date, amount, and where it came from."
      >
        {open ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <DateRangeFields
                from={dates.from}
                to={dates.to}
                today={today}
                onChange={(from, to) =>
                  onChange({ ...filter, datesPicked: true, lists: { ...filter.lists, from, to } })
                }
              />
              {filter.datesPicked ? (
                <button
                  type="button"
                  className={ghostButton}
                  onClick={() =>
                    onChange({
                      ...filter,
                      datesPicked: false,
                      lists: { ...filter.lists, from: "", to: "" },
                    })
                  }
                >
                  Go back to {year}
                </button>
              ) : (
                <p className="text-sm text-muted">
                  Showing {year}, the year picked on the page. Pick dates to see other years.
                </p>
              )}
            </div>
            <RangeSlider
              label="Amount"
              max={sliderMax(largestCents)}
              low={filter.lists.minDollars}
              high={filter.lists.maxDollars}
              onChange={(minDollars, maxDollars) =>
                onChange({ ...filter, lists: { ...filter.lists, minDollars, maxDollars } })
              }
            />
            <CheckList
              label="Sources"
              options={sources.map((source) => ({ value: source, label: source }))}
              picked={filter.lists.categories}
              onChange={(categories) =>
                onChange({ ...filter, lists: { ...filter.lists, categories } })
              }
            />
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={primaryButton} onClick={() => setOpen(false)}>
                Show {shown} {shown === 1 ? "income" : "incomes"}
              </button>
              <button
                type="button"
                className={ghostButton}
                disabled={count === 0}
                onClick={() => onChange({ ...noTithingFilter, q: filter.q, sort: filter.sort })}
              >
                Clear filters
              </button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
