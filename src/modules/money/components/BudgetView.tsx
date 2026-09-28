import { ChevronLeft, ChevronRight } from "lucide-react";
import { type FormEvent, lazy, Suspense, useId, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { ProgressBar } from "../../../client/components/ProgressBar";
import { Stat } from "../../../client/components/Stat";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { StatusDot } from "../../../client/components/StatusDot";
import {
  ghostButton,
  iconButton,
  inputClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import {
  budgetStatus,
  historySummary,
  monthOf,
  remainingText,
  shiftMonth,
} from "../../../shared/budget";
import { centsToInput, formatCents, parseDollars } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";
import { type Book, type BudgetMonth, useBudget, useSetBudget } from "../queries";
import { CashFlowPanel } from "./CashFlowPanel";

// The chart loads on demand, so the rest of the app doesn't carry the chart library.
const BudgetHistoryChart = lazy(() =>
  import("./BudgetChart").then((module) => ({ default: module.BudgetHistoryChart })),
);

/** "September 2026" */
function longMonth(month: string): string {
  const [year = 0, index = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A book's monthly budget: what each spending category may spend, and what it has. */
export function BudgetView({ book, today }: { book: Book; today: string }) {
  const current = monthOf(today);
  const [month, setMonth] = useState(current);
  const budget = useBudget(book.id, month);

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Previous month"
          className={iconButton}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        <h2 className="min-w-40 text-center text-xl font-semibold tracking-[-0.01em] text-fg">
          {longMonth(month)}
        </h2>
        <button
          type="button"
          aria-label="Next month"
          className={iconButton}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
        {month === current ? null : (
          <button type="button" className={ghostButton} onClick={() => setMonth(current)}>
            Back to this month
          </button>
        )}
      </div>

      {budget.isPending ? (
        <LoadingRows rows={4} />
      ) : budget.isError ? (
        <ErrorNote error={budget.error} onRetry={() => void budget.refetch()} />
      ) : (
        <div
          className={`grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6 ${
            budget.isPlaceholderData ? "opacity-60" : ""
          }`}
        >
          <Summary data={budget.data} />
          <CashFlowPanel book={book} month={month} />
          <Panel title="Categories" className="lg:col-span-7">
            <CategoryBudgets data={budget.data} />
          </Panel>
          <Panel title="Last 6 months" className="lg:col-span-5">
            <Suspense fallback={<LoadingRows rows={3} />}>
              <BudgetHistoryChart
                months={budget.data.history}
                summary={historySummary(budget.data.history)}
              />
            </Suspense>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Summary({ data }: { data: BudgetMonth }) {
  const { totals } = data;
  const status = budgetStatus(totals.budgetedCents, totals.spentBudgetedCents);
  const extras = [
    totals.spentUnbudgetedCents !== 0
      ? `${formatCents(totals.spentUnbudgetedCents)} in categories without a budget`
      : "",
    totals.uncategorizedCents > 0 ? `${formatCents(totals.uncategorizedCents)} uncategorized` : "",
  ].filter(Boolean);
  return (
    <Panel
      title="Overview"
      description={
        extras.length > 0
          ? `Also spent: ${extras.join(", ")}.`
          : "Transfers between accounts don't count."
      }
      className="lg:col-span-12"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Budgeted" value={formatCents(totals.budgetedCents)} />
        <Stat
          label="Spent"
          value={formatCents(totals.spentBudgetedCents)}
          note="In budgeted categories"
        />
        <Stat
          label={status.over ? "Over" : "Left"}
          value={formatCents(Math.abs(status.remainingCents))}
          note={
            totals.budgetedCents === 0
              ? "Set a budget below"
              : status.over
                ? "More than budgeted"
                : `${100 - status.percent}% of the budget`
          }
        />
        <Stat label="Income" value={formatCents(totals.incomeCents)} />
      </div>
    </Panel>
  );
}

function CategoryBudgets({ data }: { data: BudgetMonth }) {
  const [announcement, setAnnouncement] = useState("");
  if (data.categories.length === 0) {
    return (
      <p className="text-muted">
        Add spending categories (Categories, above) to set budgets for them.
      </p>
    );
  }
  const budgeted = data.categories.filter((row) => row.budgetCents !== null);
  const unbudgeted = data.categories.filter((row) => row.budgetCents === null);
  return (
    <div className="space-y-6">
      {budgeted.length > 0 ? (
        <ul className="space-y-2">
          {budgeted.map((row) => (
            <CategoryRow key={row.id} row={row} month={data.month} onSaved={setAnnouncement} />
          ))}
        </ul>
      ) : (
        <p className="text-muted">
          No budgets for {longMonth(data.month)} yet. Set one for a category below; it carries on to
          later months until you change it.
        </p>
      )}
      {unbudgeted.length > 0 ? (
        <section aria-label="Without a budget" className="space-y-2">
          <h3 className="text-sm font-semibold text-muted">Without a budget</h3>
          <ul className="space-y-2">
            {unbudgeted.map((row) => (
              <CategoryRow key={row.id} row={row} month={data.month} onSaved={setAnnouncement} />
            ))}
          </ul>
        </section>
      ) : null}
      <p role="status" className="text-sm font-semibold text-ok empty:hidden">
        {announcement}
      </p>
    </div>
  );
}

function CategoryRow({
  row,
  month,
  onSaved,
}: {
  row: BudgetMonth["categories"][number];
  month: string;
  onSaved: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(row.budgetCents ? centsToInput(row.budgetCents) : "");
  const [tried, setTried] = useState(false);
  const save = useSetBudget();
  const ids = useId();
  const cents = parseDollars(amount);
  const invalid = cents === null;

  const submit = (amountCents: number, message: string) =>
    save.mutate(
      { categoryId: row.id, month, amountCents },
      {
        onSuccess: () => {
          setEditing(false);
          setTried(false);
          onSaved(message);
        },
      },
    );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (cents === null) return;
    submit(cents, cents === 0 ? `Budget removed for ${row.name}` : `Budget saved for ${row.name}`);
  };

  const status = row.budgetCents === null ? null : budgetStatus(row.budgetCents, row.spentCents);

  return (
    <li className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold break-words ${row.archived ? "text-muted" : "text-fg"}`}>
            {row.name}
            {row.archived ? <span className="font-normal text-muted"> · Archived</span> : null}
          </p>
          <p className="text-sm text-muted tabular-nums">
            {row.budgetCents === null
              ? `${formatSigned(row.spentCents)} spent`
              : `${formatSigned(row.spentCents)} of ${formatCents(row.budgetCents)}`}
          </p>
        </div>
        {editing ? null : (
          <button
            type="button"
            className={`${ghostButton} -mr-2`}
            aria-label={`${row.budgetCents === null ? "Set budget" : "Change budget"} for ${row.name}`}
            onClick={() => setEditing(true)}
          >
            {row.budgetCents === null ? "Set budget" : "Change"}
          </button>
        )}
      </div>
      {status && row.budgetCents !== null ? (
        <div className="space-y-1">
          <ProgressBar
            percent={status.percent}
            over={status.over}
            label={`${row.name}: ${status.percent}% of the budget used`}
          />
          <p
            className={`flex items-center gap-2 text-sm font-semibold tabular-nums ${
              status.over ? "text-danger" : "text-muted"
            }`}
          >
            {status.over ? <StatusDot tone="danger" /> : null}
            {remainingText(status)}
          </p>
        </div>
      ) : null}
      {editing ? (
        <form onSubmit={onSubmit} noValidate className="space-y-2">
          <label htmlFor={`${ids}-amount`} className="block text-sm font-semibold text-muted">
            Monthly budget for {row.name}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={`${ids}-amount`}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              aria-invalid={tried && invalid}
              aria-describedby={`${ids}-hint`}
              className={`${inputClass} w-36 tabular-nums`}
            />
            <button type="submit" className={primaryButton} disabled={save.isPending}>
              Save budget
            </button>
            <button type="button" className={ghostButton} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          <p
            id={`${ids}-hint`}
            className={`text-sm ${tried && invalid ? "text-danger" : "text-muted"}`}
          >
            {tried && invalid
              ? "Use an amount like 250 or 99.50."
              : `Applies to ${longMonth(month)} and later months, until you change it.`}
          </p>
          {row.budgetCents !== null ? (
            <button
              type="button"
              className={`${secondaryButton}`}
              disabled={save.isPending}
              onClick={() => submit(0, `Budget removed for ${row.name}`)}
            >
              Remove budget from {longMonth(month)} on
            </button>
          ) : null}
          {save.error ? (
            <p role="alert" className="text-sm text-danger">
              {save.error.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </li>
  );
}
