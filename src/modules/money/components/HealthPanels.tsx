import { lazy, Suspense, useMemo, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { Slider } from "../../../client/components/Slider";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { StatusDot } from "../../../client/components/StatusDot";
import { coverageLevel, projectNetWorth, savingsLevel } from "../../../shared/health";
import { formatCents } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";
import { type Book, type Health, type NetWorth, useHealth } from "../queries";

const ProjectionChart = lazy(() =>
  import("./ProjectionChart").then((module) => ({ default: module.ProjectionChart })),
);

/** Months of spending covered and the savings rate, then a projection to play with. */
export function HealthPanels({
  book,
  worth,
  showBook,
}: {
  book: Book;
  worth: NetWorth;
  /** Several books: say which one the numbers come from. */
  showBook: boolean;
}) {
  const health = useHealth(book.id);
  if (health.isPending) return <LoadingRows rows={3} />;
  if (health.isError) {
    return <ErrorNote error={health.error} onRetry={() => void health.refetch()} />;
  }
  return (
    <>
      <HealthNumbers health={health.data} bookName={showBook ? book.name : null} />
      <Projection key={book.id} health={health.data} worth={worth} />
    </>
  );
}

function HealthNumber({
  label,
  value,
  level,
  note,
}: {
  label: string;
  value: string;
  level: { label: string; tone: "ok" | "warn" | "danger" } | null;
  note: string;
}) {
  return (
    <div className="min-w-0 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-2 truncate text-2xl font-bold tracking-[-0.02em] text-fg">{value}</p>
      {level ? (
        <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-fg">
          <StatusDot tone={level.tone} />
          {level.label}
        </p>
      ) : null}
      <p className="mt-1 text-sm text-muted">{note}</p>
    </div>
  );
}

function HealthNumbers({ health, bookName }: { health: Health; bookName: string | null }) {
  const from =
    health.months === 0
      ? "Needs a full month of transactions."
      : `From the last ${health.months === 1 ? "full month" : `${health.months} full months`}${bookName ? ` in ${bookName}` : ""}.`;
  return (
    <Panel title="Money health" description={from} className="lg:col-span-12">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HealthNumber
          label="Months covered"
          value={health.monthsCovered === null ? "None" : String(health.monthsCovered)}
          level={health.monthsCovered === null ? null : coverageLevel(health.monthsCovered)}
          note={`${formatCents(health.liquidCents)} in checking, savings, and cash.`}
        />
        <HealthNumber
          label="Savings rate"
          value={health.savingsRatePercent === null ? "None" : `${health.savingsRatePercent}%`}
          level={
            health.savingsRatePercent === null ? null : savingsLevel(health.savingsRatePercent)
          }
          note="Of income, kept after spending."
        />
        <HealthNumber
          label="Spending a month"
          value={formatCents(health.averageSpendingCents)}
          level={null}
          note="On average, refunds taken off."
        />
        <HealthNumber
          label="Income a month"
          value={formatCents(health.averageIncomeCents)}
          level={null}
          note="On average, transfers left out."
        />
      </div>
    </Panel>
  );
}

function Projection({ health, worth }: { health: Health; worth: NetWorth }) {
  const net = worth.points.at(-1)?.netCents ?? health.netCents;
  const invested = worth.accounts
    .filter((account) => account.kind === "investment" && account.balanceCents > 0)
    .reduce((sum, account) => sum + account.balanceCents, 0);
  const usual = Math.max(
    0,
    Math.round((health.averageIncomeCents - health.averageSpendingCents) / 1_000) * 1_000,
  );
  const [monthlyCents, setMonthly] = useState(usual);
  const [returnPercent, setReturn] = useState(5);
  const [years, setYears] = useState(10);
  const points = useMemo(
    () =>
      projectNetWorth({
        netCents: net,
        investedCents: invested,
        monthlyCents,
        returnPercent,
        years,
      }),
    [net, invested, monthlyCents, returnPercent, years],
  );
  const end = points.at(-1);
  const growth = end ? end.netCents - end.savedOnlyCents : 0;
  const summary = end
    ? `In ${years} ${years === 1 ? "year" : "years"}: about ${formatSigned(end.netCents)}. Saving alone gets to ${formatSigned(end.savedOnlyCents)}; growth adds ${formatCents(Math.max(0, growth))}.`
    : "";
  const max = Math.max(200_000, Math.ceil((usual * 2) / 10_000) * 10_000);
  return (
    <Panel
      title="Where it could go"
      description="A rough guide, not a promise: it assumes what you save is invested, and returns go up and down."
      className="lg:col-span-12"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-2 lg:col-span-4">
          <Slider
            label="Saved each month"
            min={0}
            max={max}
            step={1_000}
            value={monthlyCents}
            onChange={setMonthly}
            format={(cents) => formatCents(cents)}
            hint={usual > 0 ? `Lately about ${formatCents(usual)}.` : undefined}
          />
          <Slider
            label="Yearly return"
            min={0}
            max={12}
            step={0.5}
            value={returnPercent}
            onChange={setReturn}
            format={(value) => `${value}%`}
          />
          <Slider
            label="Years ahead"
            min={1}
            max={40}
            step={1}
            value={years}
            onChange={setYears}
            format={(value) => `${value} ${value === 1 ? "year" : "years"}`}
          />
        </div>
        <div className="min-w-0 lg:col-span-8">
          <Suspense fallback={<LoadingRows rows={3} />}>
            <ProjectionChart points={points} summary={summary} />
          </Suspense>
        </div>
      </div>
    </Panel>
  );
}
