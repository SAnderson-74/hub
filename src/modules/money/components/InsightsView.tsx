import { ChevronLeft, ChevronRight } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { Stat } from "../../../client/components/Stat";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { StatusDot } from "../../../client/components/StatusDot";
import { ghostButton, iconButton } from "../../../client/components/ui";
import { monthOf, shiftMonth } from "../../../shared/budget";
import { changeText } from "../../../shared/insights";
import { formatCents } from "../../../shared/money";
import { formatSigned, monthLabel } from "../../../shared/profit";
import { type Book, type Insights, useInsights, useYearReview } from "../queries";

const InsightsChart = lazy(() =>
  import("./InsightsChart").then((module) => ({ default: module.InsightsChart })),
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

/** "12% more than last month, 5% less than Jun 2029" from what each comparison has. */
function comparison(now: number, lastMonth: number, lastYear: number, month: string): string {
  const parts = [
    changeText(now, lastMonth) && `${changeText(now, lastMonth)} than last month`,
    changeText(now, lastYear) &&
      `${changeText(now, lastYear)} than ${monthLabel(shiftMonth(month, -12), true)}`,
  ].filter(Boolean);
  return parts.join(", ");
}

function chartSummary(data: Insights): string {
  const latest = data.months.at(-1);
  if (!latest || data.months.every((entry) => entry.spentCents <= 0)) {
    return "No spending in the last 12 months.";
  }
  const before = data.months.at(-2)?.spentCents ?? 0;
  const compared = comparison(latest.spentCents, before, latest.lastYearCents, data.month);
  return `${formatCents(latest.spentCents)} spent in ${longMonth(data.month)}${compared ? `, ${compared}` : ""}.`;
}

/** Where money is going: month over month, year over year, by category and store. */
export function InsightsView({ book, today }: { book: Book; today: string }) {
  const current = monthOf(today);
  const [month, setMonth] = useState(current);
  const insights = useInsights(book.id, month);

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

      {insights.isPending ? (
        <LoadingRows rows={4} />
      ) : insights.isError ? (
        <ErrorNote error={insights.error} onRetry={() => void insights.refetch()} />
      ) : (
        <div
          className={`grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-start lg:gap-4 ${
            insights.isPlaceholderData ? "opacity-60" : ""
          }`}
        >
          <Alerts data={insights.data} />
          <Panel title="Spending by month" className="lg:col-span-7">
            <Suspense fallback={<LoadingRows rows={3} />}>
              <InsightsChart months={insights.data.months} summary={chartSummary(insights.data)} />
            </Suspense>
          </Panel>
          <ByCategory data={insights.data} />
          <ByStore data={insights.data} />
          <YearInReview book={book} year={Number(month.slice(0, 4))} today={today} />
        </div>
      )}
    </div>
  );
}

function Alerts({ data }: { data: Insights }) {
  if (data.alerts.length === 0) return null;
  return (
    <Panel
      title="Running high"
      description="Well above what these categories usually spend in a month."
      className="lg:col-span-12"
    >
      <ul className="space-y-2">
        {data.alerts.map((alert) => (
          <li
            key={alert.id}
            className="flex items-start gap-2 rounded-tile bg-base/80 p-3 text-sm text-fg ring-1 ring-warn/40"
          >
            <span className="mt-1.5">
              <StatusDot tone="warn" />
            </span>
            <span>
              {alert.name} is at {formatCents(alert.spentCents)} in {longMonth(data.month)}, above
              its usual {formatCents(alert.usualCents)}.
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ByCategory({ data }: { data: Insights }) {
  const rows = data.categories.filter(
    (row) => row.thisCents !== 0 || row.lastMonthCents !== 0 || row.usualCents !== 0,
  );
  return (
    <Panel
      title="By category"
      description="This month against last month, a year ago, and the usual."
      className="lg:col-span-5"
    >
      {rows.length === 0 ? (
        <p className="text-muted">No spending in categories this month or last.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const compared = comparison(
              row.thisCents,
              row.lastMonthCents,
              row.lastYearCents,
              data.month,
            );
            return (
              <li key={row.id} className="rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 font-semibold break-words text-fg">{row.name}</span>
                  <span className="shrink-0 font-semibold text-fg tabular-nums">
                    {formatSigned(row.thisCents)}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {[compared, row.usualCents > 0 ? `usual ${formatCents(row.usualCents)}` : ""]
                    .filter(Boolean)
                    .join(" · ") || "Nothing to compare yet"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function ByStore({ data }: { data: Insights }) {
  return (
    <Panel title="By store" description="Where the most went this month." className="lg:col-span-6">
      {data.stores.length === 0 ? (
        <p className="text-muted">No spending this month.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {data.stores.map((store) => {
            const compared = comparison(
              store.thisCents,
              store.lastMonthCents,
              store.lastYearCents,
              data.month,
            );
            return (
              <li key={store.key} className="border-b border-surface-0/60 py-2 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 font-semibold break-words text-fg">{store.name}</span>
                  <span className="shrink-0 tabular-nums text-fg">
                    {formatCents(store.thisCents)}
                  </span>
                </div>
                {compared ? <p className="text-muted">{compared}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function YearInReview({ book, year: initial, today }: { book: Book; year: number; today: string }) {
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(initial);
  const review = useYearReview(book.id, year);
  const data = review.data;
  return (
    <Panel
      title="Year in review"
      description={year === thisYear ? `${year} so far.` : String(year)}
      className="lg:col-span-6"
      action={
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous year"
            className={iconButton}
            onClick={() => setYear(year - 1)}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Next year"
            className={iconButton}
            disabled={year >= thisYear}
            onClick={() => setYear(year + 1)}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      }
    >
      {review.isPending ? (
        <LoadingRows rows={3} />
      ) : review.isError ? (
        <ErrorNote error={review.error} onRetry={() => void review.refetch()} />
      ) : !data ? null : data.transactionCount === 0 ? (
        <p className="text-muted">No transactions in {year}.</p>
      ) : (
        <div className={`space-y-4 ${review.isPlaceholderData ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Came in" value={formatCents(data.inCents)} />
            <Stat
              label="Spent"
              value={formatCents(data.outCents)}
              note={
                changeText(data.outCents, data.lastYearOutCents)
                  ? `${changeText(data.outCents, data.lastYearOutCents)} than ${year - 1}`
                  : undefined
              }
            />
            <Stat
              label={data.savedCents < 0 ? "Short" : "Saved"}
              value={formatCents(Math.abs(data.savedCents))}
            />
            <Stat
              label="Savings rate"
              value={data.savingsRatePercent === null ? "None" : `${data.savingsRatePercent}%`}
              note="Saved as a share of what came in"
            />
          </div>
          <p className="text-sm text-muted">
            {data.transactionCount} transactions
            {data.biggestMonth
              ? `. The most went out in ${longMonth(data.biggestMonth.month)}: ${formatCents(data.biggestMonth.spentCents)}.`
              : "."}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TopList title="Top categories" rows={data.categories} />
            <TopList
              title="Top stores"
              rows={data.stores.map((store) => ({
                name: store.name,
                cents: store.cents,
                note: `${store.count} ${store.count === 1 ? "visit" : "visits"}`,
              }))}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

function TopList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ name: string; cents: number; note?: string }>;
}) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2 text-sm font-semibold text-muted">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">None yet.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.name} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words text-fg">
                {row.name}
                {row.note ? <span className="text-muted"> · {row.note}</span> : null}
              </span>
              <span className="shrink-0 tabular-nums text-fg">{formatCents(row.cents)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
