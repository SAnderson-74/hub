import { CircleCheck, ClipboardPaste, HandCoins, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { Stat } from "../../../client/components/Stat";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { StatusDot } from "../../../client/components/StatusDot";
import {
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { formatCents } from "../../../shared/money";
import { FUND_LABELS } from "../../../shared/tithing";
import { formatShortDate, localDate } from "../../tasks/dates";
import { FilterBar } from "../components/FilterBar";
import { IncomeSheet } from "../components/IncomeSheet";
import { MonthlyChart } from "../components/MonthlyChart";
import { PasteTithingSheet } from "../components/PasteTithingSheet";
import { PaymentSheet, type PaymentTarget } from "../components/PaymentSheet";
import { SourceChart } from "../components/SourceChart";
import { TithingBadge } from "../components/TithingBadge";
import { filterIncome, noTithingFilter, type TithingFilter } from "../filter";
import { type IncomeRow, type Overview, type PaymentRow, useOverview, useSettle } from "../queries";

/** Tithing: what's owed and paid, income and donations, and the year at a glance. */
export function TithingPage() {
  const today = localDate(useNow());
  const [params, setParams] = useSearchParams();
  const asked = Number(params.get("year"));
  const [chosenYear, setChosenYear] = useState<number | undefined>(
    Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : undefined,
  );
  const overview = useOverview(chosenYear);
  const yearId = useId();
  const [payment, setPayment] = useState<PaymentTarget>(null);
  const [income, setIncome] = useState<IncomeRow | null>(null);
  const [pasting, setPasting] = useState(false);
  const data = overview.data;
  const [filter, setFilter] = useState<TithingFilter>(noTithingFilter);
  // Unpaid income spans every year unless dates are picked; the income list shows the year.
  const openRows = data ? filterIncome(data.open, filter, null) : [];
  const incomeRows = data ? filterIncome(data.income, filter, data.year) : [];

  // A link from Money (?payment=12) opens that donation once the numbers are in.
  const wanted = Number(params.get("payment"));
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the numbers arrive or the link changes
  useEffect(() => {
    if (!data || !Number.isInteger(wanted) || wanted <= 0) return;
    const found = [...data.payments, ...data.unlinkedPayments].find((row) => row.id === wanted);
    if (found) setPayment({ kind: "edit", payment: found });
    const next = new URLSearchParams(params);
    next.delete("payment");
    setParams(next, { replace: true });
  }, [data, wanted]);

  return (
    <>
      <PageHeader
        title="Tithing"
        subtitle="A tenth of what comes in. Red until it's paid, green once it is."
      />
      {overview.isPending ? (
        <LoadingRows rows={4} />
      ) : overview.isError || !data ? (
        <ErrorNote
          error={overview.error ?? new Error("Nothing came back.")}
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
          <div className="flex flex-wrap items-center gap-3 lg:col-span-12">
            <button
              type="button"
              className={primaryButton}
              onClick={() => setPayment({ kind: "new" })}
            >
              <Plus aria-hidden="true" className="size-5" />
              Record payment
            </button>
            <button type="button" className={secondaryButton} onClick={() => setPasting(true)}>
              <ClipboardPaste aria-hidden="true" className="size-4" />
              Paste from Claude
            </button>
            <div className="ml-auto flex items-center gap-3">
              <label htmlFor={yearId} className="text-sm font-semibold text-muted">
                Year
              </label>
              <div className="w-32">
                <select
                  id={yearId}
                  value={data.year}
                  onChange={(event) => setChosenYear(Number(event.target.value))}
                  className={inputClass}
                >
                  {data.years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <Summary data={data} />

          <div className="grid grid-cols-1 gap-4 lg:col-span-7">
            <FilterBar
              filter={filter}
              onChange={setFilter}
              sources={[...new Set(data.income.map((row) => row.source))].sort()}
              largestCents={data.income.reduce((top, row) => Math.max(top, row.amountCents), 0)}
              today={today}
              year={data.year}
              shown={incomeRows.length}
            />
            <OpenPanel
              rows={openRows}
              allOpen={data.open}
              today={today}
              onOpen={setIncome}
              onPay={(ids) => setPayment({ kind: "new", incomeIds: ids })}
            />
            <IncomePanel
              rows={incomeRows}
              data={data}
              datesPicked={filter.datesPicked}
              today={today}
              onOpen={setIncome}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:col-span-5">
            <PaymentsPanel
              data={data}
              today={today}
              onOpen={(row) => setPayment({ kind: "edit", payment: row })}
            />
            {data.suggestions.length > 0 ? (
              <Panel
                title="Look like donations"
                description="Bank transactions that mention tithing or the Church. Mark the ones that are."
              >
                <ul className="divide-y divide-surface-0">
                  {data.suggestions.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setPayment({ kind: "mark", suggestion: row })}
                        className="flex min-h-14 w-full items-start justify-between gap-3 rounded-control px-2 py-3 text-left hover:bg-surface-0/40"
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold break-words text-fg">
                            {row.payee || "No payee"}
                          </span>
                          <span className="block text-sm text-muted">
                            {formatShortDate(row.date, today)} · {row.account.name}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold text-fg tabular-nums">
                          {formatCents(row.amountCents)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>

          <div className="lg:col-span-7">
            <Panel title="Owed and paid by month">
              <MonthlyChart year={data.year} months={data.months} />
            </Panel>
          </div>
          <div className="lg:col-span-5">
            <Panel title="Income by source">
              {data.sources.length === 0 ? (
                <p className="text-muted">No income in {data.year} yet.</p>
              ) : (
                <SourceChart year={data.year} sources={data.sources} />
              )}
            </Panel>
          </div>
          <div className="lg:col-span-12">
            <YearSummary data={data} />
          </div>
        </div>
      )}

      {data ? (
        <PaymentSheet
          target={payment}
          overview={data}
          today={today}
          onClose={() => setPayment(null)}
        />
      ) : null}
      <IncomeSheet
        row={income}
        today={today}
        onPay={(row) => {
          setIncome(null);
          setPayment({ kind: "new", incomeIds: [row.id] });
        }}
        onClose={() => setIncome(null)}
      />
      <PasteTithingSheet open={pasting} onClose={() => setPasting(false)} />
    </>
  );
}

/** The numbers at the top: what's unpaid (red) or all paid up (green), and the year. */
function Summary({ data }: { data: Overview }) {
  const { summary } = data;
  const unpaid = summary.unpaidCents > 0;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-12 lg:grid-cols-4">
      <div
        className={`min-w-0 rounded-tile bg-base/80 p-4 ring-1 ${unpaid ? "ring-danger/50" : "ring-ok/40"}`}
      >
        <p className="text-sm font-semibold text-muted">Unpaid</p>
        <p
          className={`mt-2 truncate text-2xl font-bold tracking-[-0.02em] ${unpaid ? "text-danger" : "text-ok"}`}
        >
          {formatCents(summary.unpaidCents)}
        </p>
        <p
          className={`mt-1 flex items-center gap-1.5 text-sm font-semibold ${unpaid ? "text-danger" : "text-ok"}`}
        >
          <StatusDot tone={unpaid ? "danger" : "ok"} />
          {unpaid
            ? `On ${summary.unpaidCount} ${summary.unpaidCount === 1 ? "income" : "incomes"}`
            : "All paid up"}
        </p>
      </div>
      <Stat
        label={`Owed in ${data.year}`}
        value={formatCents(summary.owedYearCents)}
        note={`${data.percent}% of ${formatCents(summary.tithableYearCents)}`}
      />
      <Stat
        label={`Paid in ${data.year}`}
        value={formatCents(summary.paidYearCents)}
        note={
          summary.fastOfferingYearCents + summary.otherYearCents > 0
            ? `Plus ${formatCents(summary.fastOfferingYearCents + summary.otherYearCents)} in other donations`
            : "Tithing payments"
        }
      />
      <Stat
        label="Paid, not matched yet"
        value={formatCents(summary.unlinkedCents)}
        note={
          summary.unlinkedCents > 0 ? "Match payments to income below" : "Every payment is matched"
        }
      />
    </div>
  );
}

/** The last day of last month and of last year, for catching up in one tap. */
function catchUpDates(today: string): Array<{ label: string; date: string }> {
  const [year = 0, month = 1] = today.split("-").map(Number);
  const lastMonthEnd = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
  return [
    { label: "End of last month", date: lastMonthEnd },
    { label: `End of ${year - 1}`, date: `${year - 1}-12-31` },
  ];
}

/** Unpaid income of every year, with ways to pay several at once or mark them paid. */
function OpenPanel({
  rows,
  allOpen,
  today,
  onOpen,
  onPay,
}: {
  /** The unpaid income that matches the filters. */
  rows: IncomeRow[];
  /** All unpaid income, for catching up through a date whatever the filters. */
  allOpen: IncomeRow[];
  today: string;
  onOpen: (row: IncomeRow) => void;
  onPay: (incomeIds: number[]) => void;
}) {
  const ids = useId();
  const settle = useSettle();
  const [picked, setPicked] = useState<number[]>([]);
  const [through, setThrough] = useState("");
  // What was just marked paid, so it can be undone.
  const [marked, setMarked] = useState<number[] | null>(null);
  // Rows that were paid since no longer count as picked.
  const chosen = rows.filter((row) => picked.includes(row.id));
  const total = chosen.reduce((sum, row) => sum + row.owedCents - row.paidCents, 0);
  const catchUp = through === "" ? [] : allOpen.filter((row) => row.date <= through);
  const catchUpTotal = catchUp.reduce((sum, row) => sum + row.owedCents - row.paidCents, 0);
  const toggle = (id: number) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const markPaid = (incomeIds: number[]) =>
    settle.mutate(
      { incomeIds, settled: true },
      {
        onSuccess: () => {
          setMarked(incomeIds);
          setPicked([]);
          setThrough("");
        },
      },
    );
  return (
    <Panel
      title="Needs tithing paid"
      description="Income with tithing left to pay, oldest first. Pick several to pay them together."
      action={
        rows.length > 0 ? (
          <button
            type="button"
            className={secondaryButton}
            onClick={() =>
              setPicked(picked.length === rows.length ? [] : rows.map((row) => row.id))
            }
          >
            {picked.length === rows.length ? "Clear" : "Pick all"}
          </button>
        ) : undefined
      }
    >
      {marked ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-tile bg-base/80 p-4 ring-1 ring-ok/40">
          <p role="status" className="min-w-0 flex-1 font-semibold text-ok">
            Marked {marked.length} {marked.length === 1 ? "income" : "incomes"} as paid.
          </p>
          <button
            type="button"
            className={secondaryButton}
            disabled={settle.isPending}
            onClick={() =>
              settle.mutate(
                { incomeIds: marked, settled: false },
                { onSuccess: () => setMarked(null) },
              )
            }
          >
            Undo
          </button>
        </div>
      ) : null}
      {allOpen.length === 0 ? (
        <p className="flex items-center gap-2 font-semibold text-ok">
          <StatusDot tone="ok" />
          All caught up. Nothing is waiting to be paid.
        </p>
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="text-muted">No unpaid income matches the filters.</p>
          ) : (
            <ul className="divide-y divide-surface-0">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start">
                  <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
                    <input
                      type="checkbox"
                      checked={picked.includes(row.id)}
                      onChange={() => toggle(row.id)}
                      className="size-5 accent-accent"
                    />
                    <span className="sr-only">Pick {row.payee || "this income"}</span>
                  </label>
                  <IncomeButton row={row} today={today} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={chosen.length === 0}
              onClick={() => onPay(chosen.map((row) => row.id))}
            >
              <HandCoins aria-hidden="true" className="size-5" />
              {chosen.length === 0 ? "Pay picked" : `Pay ${formatCents(total)}`}
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={chosen.length === 0 || settle.isPending}
              onClick={() => markPaid(chosen.map((row) => row.id))}
            >
              <CircleCheck aria-hidden="true" className="size-4" />
              Mark picked as paid
            </button>
            <p className="min-w-0 text-sm text-muted">
              {chosen.length === 0
                ? "Pick income to pay it in one payment, or to mark it paid."
                : `${chosen.length} ${chosen.length === 1 ? "income" : "incomes"} picked.`}
            </p>
          </div>
          <details className="mt-5 rounded-tile bg-base/80 px-4 ring-1 ring-surface-0/50">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold text-fg">
              Already paid these before using Hub?
            </summary>
            <div className="space-y-4 pb-4">
              <p className="text-sm text-muted">
                Mark income as paid without adding a payment, so your Money balances stay as they
                are. You can undo it.
              </p>
              <div className="flex flex-wrap gap-2">
                {catchUpDates(today).map((choice) => (
                  <button
                    key={choice.date}
                    type="button"
                    aria-pressed={through === choice.date}
                    onClick={() => setThrough(choice.date)}
                    className={`inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold ${
                      through === choice.date
                        ? "bg-surface-1 text-fg"
                        : "bg-surface-0 text-muted hover:text-fg"
                    }`}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <div className="max-w-60">
                <label htmlFor={`${ids}-through`} className={labelClass}>
                  Paid through
                </label>
                <input
                  id={`${ids}-through`}
                  type="date"
                  value={through}
                  max={today}
                  onChange={(event) => setThrough(event.target.value)}
                  className={`${inputClass} [color-scheme:dark]`}
                />
              </div>
              <button
                type="button"
                className={secondaryButton}
                disabled={catchUp.length === 0 || settle.isPending}
                onClick={() => markPaid(catchUp.map((row) => row.id))}
              >
                {through === ""
                  ? "Pick a date"
                  : catchUp.length === 0
                    ? "Nothing unpaid by then"
                    : `Mark ${catchUp.length} ${catchUp.length === 1 ? "income" : "incomes"} paid (${formatCents(catchUpTotal)})`}
              </button>
              {settle.error ? (
                <p role="alert" className="text-sm text-danger">
                  {settle.error.message}
                </p>
              ) : null}
            </div>
          </details>
        </>
      )}
    </Panel>
  );
}

function IncomeButton({
  row,
  today,
  onOpen,
}: {
  row: IncomeRow;
  today: string;
  onOpen: (row: IncomeRow) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="flex min-h-14 min-w-0 flex-1 items-start justify-between gap-3 rounded-control px-2 py-3 text-left hover:bg-surface-0/40"
    >
      <span className="min-w-0">
        <span className="block font-semibold break-words text-fg">{row.payee || "No payee"}</span>
        <span className="block text-sm text-muted">
          {[formatShortDate(row.date, today), row.source, row.account.name]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="mt-0.5 block">
          {row.status ? (
            <TithingBadge
              status={row.status}
              owedCents={row.owedCents}
              paidCents={row.paidCents}
              settled={row.settled}
              prefix=""
            />
          ) : (
            <span className="text-sm text-muted">Not tithed on</span>
          )}
        </span>
        {row.applies && (row.customBase || row.baseCents !== row.amountCents) ? (
          <span className="block text-sm text-muted tabular-nums">
            Tithing on {formatCents(row.baseCents)} of {formatCents(row.amountCents)}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 font-semibold text-fg tabular-nums">
        +{formatCents(row.amountCents)}
      </span>
    </button>
  );
}

/** All of the year's income, paid or not. */
function IncomePanel({
  rows: matching,
  data,
  datesPicked,
  today,
  onOpen,
}: {
  /** The income that matches the filters. */
  rows: IncomeRow[];
  data: Overview;
  /** Dates were picked, so this isn't just the year shown on the page. */
  datesPicked: boolean;
  today: string;
  onOpen: (row: IncomeRow) => void;
}) {
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid" | "exempt">("all");
  const filters = [
    ["all", "All"],
    ["unpaid", "Not paid"],
    ["paid", "Paid"],
    ["exempt", "Not tithed on"],
  ] as const;
  const rows = matching.filter((row) =>
    filter === "all"
      ? true
      : filter === "exempt"
        ? !row.applies
        : filter === "paid"
          ? row.status === "paid"
          : row.status === "unpaid" || row.status === "partial",
  );
  return (
    <Panel
      title={datesPicked ? "Income" : `Income in ${data.year}`}
      description="Tap one to turn tithing off for it, or to tithe on only part of it, like a sale's profit."
    >
      <fieldset className="mb-4 min-w-0">
        <legend className="sr-only">Show income</legend>
        <div className="flex flex-wrap gap-2">
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold ${
                filter === value ? "bg-surface-1 text-fg" : "bg-surface-0 text-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      {matching.length === 0 ? (
        <p className="text-muted">
          {data.income.length === 0
            ? "No money has come in yet. Income you add in Money shows up here."
            : datesPicked
              ? "No income matches the filters."
              : `No income matches in ${data.year}. Try the filters to see other years.`}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted">Nothing matches.</p>
      ) : (
        <ul className="divide-y divide-surface-0">
          {rows.map((row) => (
            <li key={row.id}>
              <IncomeButton row={row} today={today} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Donations of the year, and those still to match to income. */
function PaymentsPanel({
  data,
  today,
  onOpen,
}: {
  data: Overview;
  today: string;
  onOpen: (row: PaymentRow) => void;
}) {
  const rows = data.payments;
  return (
    <Panel title={`Payments in ${data.year}`} description="Tap one to match it to income.">
      {data.unlinkedPayments.length > 0 ? (
        <div className="mb-4 rounded-tile bg-base/80 p-4 ring-1 ring-warn/40">
          <p className="flex items-center gap-2 font-semibold text-warn">
            <StatusDot tone="warn" />
            {formatCents(data.summary.unlinkedCents)} paid but not matched
          </p>
          <ul className="mt-2 space-y-1">
            {data.unlinkedPayments.slice(0, 5).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onOpen(row)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-2 text-left text-sm text-fg hover:bg-surface-0/40"
                >
                  <span className="min-w-0 break-words">
                    {formatShortDate(row.date, today)} ·{" "}
                    {formatCents(row.amountCents - row.linkedCents)} to match
                  </span>
                  <span className="shrink-0 font-semibold text-accent-text">Match</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-muted">
          No payments in {data.year}. Record one when you pay, or paste your donation history.
        </p>
      ) : (
        <ul className="divide-y divide-surface-0">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onOpen(row)}
                className="flex min-h-14 w-full items-start justify-between gap-3 rounded-control px-2 py-3 text-left hover:bg-surface-0/40"
              >
                <span className="min-w-0">
                  <span className="block font-semibold break-words text-fg">
                    {FUND_LABELS[row.fund]}
                  </span>
                  <span className="block text-sm text-muted">
                    {[formatShortDate(row.date, today), row.account.name].join(" · ")}
                  </span>
                  {row.fund === "tithing" ? (
                    <span
                      className={`flex items-center gap-1.5 text-sm font-semibold ${
                        row.linkedCents >= row.amountCents ? "text-ok" : "text-warn"
                      }`}
                    >
                      <StatusDot tone={row.linkedCents >= row.amountCents ? "ok" : "warn"} />
                      {row.linkedCents >= row.amountCents
                        ? "Matched to income"
                        : row.linkedCents > 0
                          ? `${formatCents(row.amountCents - row.linkedCents)} not matched`
                          : "Not matched to income"}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold text-fg tabular-nums">
                  {formatCents(row.amountCents)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** The year's totals in one place, for tithing settlement. */
function YearSummary({ data }: { data: Overview }) {
  const { summary } = data;
  const short = summary.owedYearCents - summary.paidYearCents - summary.settledYearCents;
  const rows: Array<[string, string]> = [
    ["Money in", formatCents(summary.incomeYearCents)],
    ["Not tithed on", formatCents(summary.incomeYearCents - summary.tithableYearCents)],
    ["Tithed on", formatCents(summary.tithableYearCents)],
    [`Tithing owed (${data.percent}%)`, formatCents(summary.owedYearCents)],
    ["Tithing paid", formatCents(summary.paidYearCents)],
    ...(summary.settledYearCents > 0
      ? ([["Marked as paid", formatCents(summary.settledYearCents)]] as Array<[string, string]>)
      : []),
    ["Fast offerings", formatCents(summary.fastOfferingYearCents)],
    ["Other donations", formatCents(summary.otherYearCents)],
  ];
  return (
    <Panel
      title={`${data.year} summary`}
      description="What came in and what was given this year, for tithing settlement."
    >
      <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex min-h-11 items-center justify-between gap-4 border-b border-surface-0"
          >
            <dt className="text-muted">{label}</dt>
            <dd className="font-semibold text-fg tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p
        className={`mt-4 flex items-center gap-2 font-semibold ${short > 0 ? "text-danger" : "text-ok"}`}
      >
        <StatusDot tone={short > 0 ? "danger" : "ok"} />
        {short > 0
          ? `${formatCents(short)} of ${data.year}'s tithing hasn't been paid.`
          : short < 0
            ? `Paid ${formatCents(-short)} more than ${data.year}'s tithing.`
            : `${data.year}'s tithing is paid in full.`}
      </p>
      {summary.balanceCents !== short ? (
        <p className="mt-1 text-sm text-muted tabular-nums">
          Counting every year, {formatCents(Math.abs(summary.balanceCents))} is{" "}
          {summary.balanceCents >= 0 ? "owed" : "paid ahead"}.
        </p>
      ) : null}
    </Panel>
  );
}
