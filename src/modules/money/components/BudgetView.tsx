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
import { formatShortDate } from "../../tasks/dates";
import { type Book, type BudgetMonth, useBudget, useSetBudget } from "../queries";
import { BudgetSettingsSheet } from "./BudgetSettingsSheet";
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
          className={`grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-start lg:gap-4 ${
            budget.isPlaceholderData ? "opacity-60" : ""
          }`}
        >
          <Summary data={budget.data} />
          <CashFlowPanel book={book} month={month} />
          <Panel title="Categories" className="lg:col-span-7">
            <CategoryBudgets data={budget.data} today={today} />
          </Panel>
          <div className="space-y-4 lg:col-span-5 lg:space-y-6">
            <SavingUp data={budget.data} today={today} />
            <Panel title="Last 6 months">
              <Suspense fallback={<LoadingRows rows={3} />}>
                <BudgetHistoryChart
                  months={budget.data.history}
                  summary={historySummary(budget.data.history)}
                />
              </Suspense>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({ data }: { data: BudgetMonth }) {
  const { totals } = data;
  const available = totals.budgetedCents + totals.carriedCents;
  const status = budgetStatus(available, totals.spentBudgetedCents);
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
        <Stat
          label="Budgeted"
          value={formatCents(totals.budgetedCents)}
          note={
            totals.carriedCents > 0
              ? `Plus ${formatCents(totals.carriedCents)} carried over`
              : undefined
          }
        />
        <Stat
          label="Spent"
          value={formatCents(totals.spentBudgetedCents)}
          note="In budgeted categories"
        />
        <Stat
          label={status.over ? "Over" : "Left"}
          value={formatCents(Math.abs(status.remainingCents))}
          note={
            available === 0
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

function CategoryBudgets({ data, today }: { data: BudgetMonth; today: string }) {
  const [announcement, setAnnouncement] = useState("");
  const [settings, setSettings] = useState<BudgetMonth["categories"][number] | null>(null);
  if (data.categories.length === 0) {
    return (
      <p className="text-muted">
        Add spending categories (Categories, above) to set budgets for them.
      </p>
    );
  }
  const budgeted = data.categories.filter((row) => row.availableCents !== null);
  const unbudgeted = data.categories.filter((row) => row.availableCents === null);
  return (
    <div className="space-y-6">
      {budgeted.length > 0 ? (
        <ul className="space-y-2">
          {budgeted.map((row) => (
            <CategoryRow
              key={row.id}
              row={row}
              month={data.month}
              onSaved={setAnnouncement}
              onSettings={() => setSettings(row)}
            />
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
              <CategoryRow
                key={row.id}
                row={row}
                month={data.month}
                onSaved={setAnnouncement}
                onSettings={() => setSettings(row)}
              />
            ))}
          </ul>
        </section>
      ) : null}
      <p role="status" className="text-sm font-semibold text-ok empty:hidden">
        {announcement}
      </p>
      <BudgetSettingsSheet
        row={settings}
        month={data.month}
        today={today}
        onClose={() => setSettings(null)}
        onSaved={(message) => {
          setSettings(null);
          setAnnouncement(message);
        }}
      />
    </div>
  );
}

function CategoryRow({
  row,
  month,
  onSaved,
  onSettings,
}: {
  row: BudgetMonth["categories"][number];
  month: string;
  onSaved: (message: string) => void;
  onSettings: () => void;
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

  const status =
    row.availableCents === null ? null : budgetStatus(row.availableCents, row.spentCents);
  const notes = [
    row.carriedCents > 0 ? `Includes ${formatCents(row.carriedCents)} carried over` : "",
    row.rollover && row.carriedCents === 0 ? "Carries over" : "",
  ].filter(Boolean);

  return (
    <li className="space-y-3 rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold break-words ${row.archived ? "text-muted" : "text-fg"}`}>
            {row.name}
            {row.archived ? <span className="font-normal text-muted"> · Archived</span> : null}
          </p>
          <p className="text-sm text-muted tabular-nums">
            {row.availableCents === null
              ? `${formatSigned(row.spentCents)} spent`
              : `${formatSigned(row.spentCents)} of ${formatCents(row.availableCents)}`}
          </p>
          {notes.length > 0 ? <p className="text-sm text-muted">{notes.join(" · ")}</p> : null}
        </div>
        {editing ? null : (
          <div className="-mr-2 flex shrink-0 flex-wrap justify-end">
            <button
              type="button"
              className={ghostButton}
              aria-label={`${row.budgetCents === null ? "Set budget" : "Change budget"} for ${row.name}`}
              onClick={() => setEditing(true)}
            >
              {row.budgetCents === null ? "Set budget" : "Change"}
            </button>
            <button
              type="button"
              className={ghostButton}
              aria-label={`Options for ${row.name}: carry over and save up`}
              onClick={onSettings}
            >
              Options
            </button>
          </div>
        )}
      </div>
      {status && row.availableCents !== null ? (
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
              className={`${inputClass} max-w-36 tabular-nums`}
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

/** Sinking funds: categories saving up for a cost, with what to set aside each month. */
function SavingUp({ data, today }: { data: BudgetMonth; today: string }) {
  const funds = data.categories.filter((row) => row.goal !== null);
  const save = useSetBudget();
  if (funds.length === 0) return null;
  return (
    <Panel
      title="Saving up"
      description="Costs that come once or twice a year, saved for a little each month."
    >
      <ul className="space-y-3">
        {funds.map((row) => {
          const goal = row.goal;
          if (!goal) return null;
          const percent = Math.min(100, Math.round((goal.savedCents / goal.cents) * 100));
          const onTrack = (row.budgetCents ?? 0) >= goal.neededMonthlyCents;
          return (
            <li
              key={row.id}
              className="space-y-2 rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="font-semibold break-words text-fg">{row.name}</p>
                <p className="text-sm text-muted tabular-nums">
                  {formatCents(goal.savedCents)} of {formatCents(goal.cents)} by{" "}
                  {formatShortDate(goal.dueDate, today)}
                </p>
              </div>
              <ProgressBar percent={percent} label={`${row.name}: ${percent}% saved`} />
              {goal.neededMonthlyCents === 0 ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-ok">
                  <StatusDot tone="ok" />
                  Saved in full
                </p>
              ) : onTrack ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-ok">
                  <StatusDot tone="ok" />
                  On track at {formatCents(row.budgetCents ?? 0)} a month
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-warn">
                    <StatusDot tone="warn" />
                    Needs {formatCents(goal.neededMonthlyCents)} a month
                  </p>
                  <button
                    type="button"
                    className={`${ghostButton} -ml-3`}
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate({
                        categoryId: row.id,
                        month: data.month,
                        amountCents: goal.neededMonthlyCents,
                      })
                    }
                  >
                    Budget {formatCents(goal.neededMonthlyCents)} a month
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {save.error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {save.error.message}
        </p>
      ) : null}
    </Panel>
  );
}
