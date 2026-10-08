import { CheckList, type CheckOption } from "../../../client/components/CheckList";
import { DateRangeFields } from "../../../client/components/DateRangeFields";
import { RangeSlider } from "../../../client/components/RangeSlider";
import { Sheet } from "../../../client/components/Sheet";
import { ghostButton, primaryButton } from "../../../client/components/ui";
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS } from "../../../shared/books";
import { filterCount, type ListFilters, noFilters, sliderMax } from "../../../shared/listFilter";
import type { Category } from "../queries";

/** The categories as checkboxes: uncategorized and transfers, then spending and income. */
export function categoryOptions(categories: Category[]): CheckOption[] {
  return [
    { value: "none", label: "Uncategorized" },
    { value: "transfer", label: "Transfers" },
    ...CATEGORY_KINDS.flatMap((kind) =>
      categories
        .filter((category) => category.kind === kind)
        .map((category) => ({
          value: String(category.id),
          label: category.archived ? `${category.name} (archived)` : category.name,
          group: CATEGORY_KIND_LABELS[kind],
        })),
    ),
  ];
}

/** Dates, a range of amounts, and several categories, for narrowing the transaction list. */
export function FilterSheet({
  open,
  onClose,
  filters,
  onChange,
  categories,
  largestCents,
  today,
  matching,
}: {
  open: boolean;
  onClose: () => void;
  filters: ListFilters;
  onChange: (filters: ListFilters) => void;
  categories: Category[];
  /** The largest amount in the book, for the slider's scale. */
  largestCents: number;
  today: string;
  /** How many transactions match now, for the button. */
  matching: number | null;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter transactions"
      description="Narrow the list by date, amount, and category."
    >
      {open ? (
        <div className="space-y-6">
          <DateRangeFields
            from={filters.from}
            to={filters.to}
            today={today}
            onChange={(from, to) => onChange({ ...filters, from, to })}
          />
          <RangeSlider
            label="Amount"
            max={sliderMax(largestCents)}
            low={filters.minDollars}
            high={filters.maxDollars}
            onChange={(minDollars, maxDollars) => onChange({ ...filters, minDollars, maxDollars })}
          />
          <CheckList
            label="Categories"
            options={categoryOptions(categories)}
            picked={filters.categories}
            onChange={(picked) => onChange({ ...filters, categories: picked })}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={primaryButton} onClick={onClose}>
              {matching === null
                ? "Show transactions"
                : `Show ${matching} ${matching === 1 ? "transaction" : "transactions"}`}
            </button>
            <button
              type="button"
              className={ghostButton}
              disabled={filterCount(filters) === 0}
              onClick={() => onChange(noFilters)}
            >
              Clear filters
            </button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
