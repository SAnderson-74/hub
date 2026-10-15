import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { Stat } from "../../../client/components/Stat";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  ghostButton,
  iconButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { cardLabel } from "../../../shared/cards";
import { formatCents } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";
import {
  DEFAULT_BASELINE,
  earnedLabel,
  parseRate,
  pointValueLabel,
  REWARD_KIND_LABELS,
  rateLabel,
  rateToInput,
} from "../../../shared/rewards";
import { formatShortDate } from "../../tasks/dates";
import type { Book, CardRewards, Category, RewardsReport } from "../queries";
import { useRewards } from "../queries";
import { PointsSheet } from "./PointsSheet";
import { RewardsSheet } from "./RewardsSheet";

// The chart loads on demand, so the rest of the app doesn't carry the chart library.
const RewardsChart = lazy(() =>
  import("./RewardsChart").then((module) => ({ default: module.RewardsChart })),
);

/** "2.1%", from value over spending. */
export function effectiveRate(valueCents: number, spentCents: number): string {
  if (spentCents <= 0) return "0%";
  return `${((valueCents / spentCents) * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

/** "Jan 1", with the year when it isn't the one shown. */
function shortDay(date: string, year: number): string {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: y === year ? undefined : "numeric",
    timeZone: "UTC",
  });
}

/** "Jan 1 to Mar 31 · first $1,500", or "" for a rate without limits. */
export function rateLimits(
  rate: { startsOn: string | null; endsOn: string | null; capCents: number | null },
  year: number,
): string {
  const when =
    rate.startsOn && rate.endsOn
      ? `${shortDay(rate.startsOn, year)} to ${shortDay(rate.endsOn, year)}`
      : rate.startsOn
        ? `From ${shortDay(rate.startsOn, year)}`
        : rate.endsOn
          ? `Until ${shortDay(rate.endsOn, year)}`
          : "";
  const cap = rate.capCents ? `first ${formatCents(rate.capCents)}${when ? "" : " each year"}` : "";
  return [when, cap].filter(Boolean).join(" · ");
}

/** What each card earned in a year: cash back or points, by month and by rate. */
export function RewardsView({
  book,
  categories,
  today,
  onAddAccount,
}: {
  book: Book;
  categories: Category[];
  today: string;
  onAddAccount: () => void;
}) {
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [baseline, setBaseline] = useState(storedBaseline);
  const report = useRewards(book.id, year, baseline);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pointsId, setPointsId] = useState<number | null>(null);
  const editing = report.data?.cards.find((entry) => entry.card.id === editingId) ?? null;
  const pointsCard = report.data?.cards.find((entry) => entry.card.id === pointsId) ?? null;
  const chooseBaseline = (value: number) => {
    setBaseline(value);
    try {
      localStorage.setItem(BASELINE_KEY, String(value));
    } catch {
      // Private browsing; the choice still applies to this visit.
    }
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Previous year"
          className={iconButton}
          onClick={() => setYear(year - 1)}
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        <h2 className="min-w-20 text-center text-xl font-semibold tracking-[-0.01em] text-fg tabular-nums">
          {year}
        </h2>
        <button
          type="button"
          aria-label="Next year"
          className={iconButton}
          onClick={() => setYear(year + 1)}
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
        {year === thisYear ? null : (
          <button type="button" className={ghostButton} onClick={() => setYear(thisYear)}>
            Back to this year
          </button>
        )}
      </div>

      {report.isPending ? (
        <LoadingRows rows={4} />
      ) : report.isError ? (
        <ErrorNote error={report.error} onRetry={() => void report.refetch()} />
      ) : report.data.cards.length === 0 ? (
        <Panel
          title="Add your cards"
          description="Rewards come from the cards on your accounts. Open a credit card account (or checking, for a debit card) and add its card there."
        >
          <button type="button" className={primaryButton} onClick={onAddAccount}>
            <Plus aria-hidden="true" className="size-5" />
            Add account
          </button>
        </Panel>
      ) : (
        <div
          className={`grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6 ${
            report.isPlaceholderData ? "opacity-60" : ""
          }`}
        >
          <Panel
            title="Overview"
            description="Estimates from each card's rates and its transactions. Your card's statement is the final word."
            className="lg:col-span-12"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Earned"
                value={formatCents(report.data.totals.valueCents)}
                note={`On ${formatCents(report.data.totals.spentCents)} spent, ${effectiveRate(report.data.totals.valueCents, report.data.totals.spentCents)} back`}
              />
              <Stat
                label="Annual fees"
                value={formatCents(report.data.totals.annualFeeCents)}
                note="Each card's fee for the year"
              />
              <Stat
                label="After fees"
                value={formatSigned(report.data.totals.netCents)}
                note="What the cards earned, less their fees"
              />
              <Stat
                label="With the best card"
                value={`+${formatCents(Math.max(0, report.data.best.bestCents - report.data.best.actualCents))}`}
                note="More, using the best card for each purchase"
              />
            </div>
            <BaselineField baseline={baseline} onChange={chooseBaseline} />
          </Panel>
          {report.data.best.tips.length > 0 ? <BestCardPanel best={report.data.best} /> : null}
          {report.data.cards.some((entry) => entry.program !== null) ? (
            <Panel title="Earned by month" className="lg:col-span-12">
              <Suspense fallback={<LoadingRows rows={3} />}>
                <RewardsChart report={report.data} />
              </Suspense>
            </Panel>
          ) : null}
          {report.data.cards.map((entry) => (
            <CardPanel
              key={entry.card.id}
              entry={entry}
              year={year}
              partYear={year === thisYear}
              baseline={report.data.baseline}
              today={today}
              onEdit={() => setEditingId(entry.card.id)}
              onPoints={() => setPointsId(entry.card.id)}
            />
          ))}
        </div>
      )}

      <RewardsSheet target={editing} categories={categories} onClose={() => setEditingId(null)} />
      <PointsSheet target={pointsCard} today={today} onClose={() => setPointsId(null)} />
    </div>
  );
}

const BASELINE_KEY = "hub.money.rewardBaseline";

function storedBaseline(): number {
  try {
    const value = parseRate(localStorage.getItem(BASELINE_KEY) ?? "");
    return value === null ? DEFAULT_BASELINE : value;
  } catch {
    return DEFAULT_BASELINE;
  }
}

/** The flat-rate card each card is compared with. Kept in this browser. */
function BaselineField({
  baseline,
  onChange,
}: {
  baseline: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(rateToInput(baseline));
  const ids = useId();
  const parsed = parseRate(text);
  return (
    <div className="mt-4">
      <label htmlFor={`${ids}-baseline`} className={labelClass}>
        Compare each card with one earning
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="relative w-28">
          <input
            id={`${ids}-baseline`}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              const value = parseRate(event.target.value);
              if (value !== null) onChange(value);
            }}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={parsed === null}
            aria-describedby={`${ids}-baseline-hint`}
            className={`${inputClass} pr-10 tabular-nums`}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted"
          >
            %
          </span>
        </div>
        <p
          id={`${ids}-baseline-hint`}
          className={`text-sm ${parsed === null ? "text-danger" : "text-muted"}`}
        >
          {parsed === null ? "Enter a rate like 2 or 1.5." : "back on everything, with no fee."}
        </p>
      </div>
    </div>
  );
}

/** Where using a different card would have earned more, biggest first. */
function BestCardPanel({ best }: { best: RewardsReport["best"] }) {
  const more = best.bestCents - best.actualCents;
  return (
    <Panel
      title="Use the best card"
      description="Ignores spending caps, which depend on what else goes on each card."
      className="lg:col-span-12"
    >
      <p className="text-fg tabular-nums">
        Putting each purchase on the card that earns the most for it would have earned{" "}
        {formatCents(best.bestCents)} instead of {formatCents(best.actualCents)},{" "}
        {formatCents(more)} more.
      </p>
      <ul className="mt-3 space-y-2">
        {best.tips.map((tip) => (
          <li
            key={`${tip.label}|${tip.fromCard}|${tip.toCard}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50"
          >
            <span className="min-w-0 break-words text-fg">
              <span className="font-semibold">{tip.label}:</span> {tip.toCard} instead of{" "}
              {tip.fromCard}
            </span>
            <span className="text-sm text-muted tabular-nums">
              {formatCents(tip.missedCents)} more on {formatCents(tip.spentCents)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** "Worth it" against the flat-rate card, after the fee, in words with its color. */
function WorthIt({
  entry,
  baseline,
  partYear,
}: {
  entry: CardRewards;
  baseline: number;
  partYear: boolean;
}) {
  const { annualFeeCents, netCents, flatCents } = entry.worth;
  const gap = netCents - flatCents;
  const flat = `a flat ${rateLabel("cash_back", baseline)} card`;
  return (
    <div className="mt-4 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <dl className="grid grid-cols-3 gap-3 text-sm tabular-nums">
        <div className="min-w-0">
          <dt className="text-muted">Annual fee</dt>
          <dd className="font-semibold text-fg">{formatCents(annualFeeCents)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">After the fee</dt>
          <dd className="font-semibold text-fg">{formatSigned(netCents)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">Flat {rateLabel("cash_back", baseline)} card</dt>
          <dd className="font-semibold text-fg">{formatCents(flatCents)}</dd>
        </div>
      </dl>
      <p className={`mt-3 text-sm font-semibold ${gap >= 0 ? "text-ok" : "text-warn"}`}>
        {gap >= 0
          ? `Worth it: ${formatCents(gap)} more than ${flat} would have earned.`
          : `Not worth it${partYear ? " so far" : ""}: ${formatCents(-gap)} less than ${flat} would have earned.`}
      </p>
      {partYear && annualFeeCents > 0 ? (
        <p className="mt-1 text-sm text-muted">This year so far, against the whole year's fee.</p>
      ) : null}
    </div>
  );
}

/** A points card's value per point, latest balance, and the statements against the estimate. */
function PointsSummary({
  entry,
  today,
  onPoints,
}: {
  entry: CardRewards;
  today: string;
  onPoints: () => void;
}) {
  const points = entry.points;
  if (!points) return null;
  const check = points.check;
  return (
    <div className="mt-4 space-y-2 text-sm">
      <p className="text-muted">
        {entry.pointValueSource === "redemptions"
          ? `Points count at ${pointValueLabel(entry.pointValue)}, what your redemptions averaged.`
          : `Points count at the ${pointValueLabel(entry.pointValue)} you set, until you add points you used.`}
        {points.redeemedPoints > 0
          ? ` This year you used ${points.redeemedPoints.toLocaleString("en-US")} for ${formatCents(points.redeemedValueCents)}.`
          : ""}
      </p>
      {points.latest ? (
        <p className="text-fg tabular-nums">
          Balance {points.latest.points.toLocaleString("en-US")} points on{" "}
          {formatShortDate(points.latest.date, today)}.
        </p>
      ) : null}
      {check ? (
        <p className="text-muted tabular-nums">
          Statements show {check.statementPoints.toLocaleString("en-US")} points earned from{" "}
          {formatShortDate(check.from, today)} to {formatShortDate(check.to, today)}; Hub estimated{" "}
          {check.estimatedPoints.toLocaleString("en-US")}.
        </p>
      ) : null}
      <button type="button" className={secondaryButton} onClick={onPoints}>
        Balances and redemptions
      </button>
    </div>
  );
}

function CardPanel({
  entry,
  year,
  partYear,
  baseline,
  today,
  onEdit,
  onPoints,
}: {
  entry: CardRewards;
  year: number;
  /** The year isn't over, so the fee is weighed against part of a year. */
  partYear: boolean;
  baseline: number;
  today: string;
  onEdit: () => void;
  onPoints: () => void;
}) {
  const { card, program } = entry;
  return (
    <Panel
      title={cardLabel(card)}
      description={[
        card.account.name,
        program
          ? `${REWARD_KIND_LABELS[program.kind]}${program.kind === "points" ? `, ${pointValueLabel(entry.pointValue)} a point` : ""}`
          : "",
        card.archived ? "Archived" : "",
      ]
        .filter(Boolean)
        .join(" · ")}
      action={
        <button type="button" className={secondaryButton} onClick={onEdit}>
          {program ? "Edit rewards" : "Set up rewards"}
        </button>
      }
      className="lg:col-span-6"
    >
      {program ? (
        <>
          <p className="text-3xl font-bold tracking-[-0.02em] text-fg tabular-nums">
            {earnedLabel(program.kind, entry.earned, entry.valueCents)}
          </p>
          <p className="mt-1 text-sm text-muted tabular-nums">
            On {formatCents(entry.spentCents)} spent in {year},{" "}
            {effectiveRate(entry.valueCents, entry.spentCents)} back.
          </p>
          <WorthIt entry={entry} baseline={baseline} partYear={partYear} />
          <PointsSummary entry={entry} today={today} onPoints={onPoints} />
          <table className="mt-4 w-full text-left text-sm tabular-nums">
            <caption className="sr-only">What each rate earned on {card.name}</caption>
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 font-semibold">
                  Rate
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  Spent
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  Earned
                </th>
              </tr>
            </thead>
            <tbody className="text-fg">
              {entry.byRate.map((rate) => {
                const limits = rateLimits(rate, year);
                return (
                  <tr key={rate.key} className="border-t border-surface-0 align-top">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <span className="block break-words">
                        <span className="font-semibold">{rateLabel(program.kind, rate.rate)}</span>{" "}
                        {rate.rateId === null ? "on everything else" : rate.label}
                      </span>
                      {limits ? <span className="block text-muted">{limits}</span> : null}
                    </th>
                    <td className="py-2 text-right">{formatCents(rate.spentCents)}</td>
                    <td className="py-2 pl-3 text-right">
                      {program.kind === "points"
                        ? rate.earned.toLocaleString("en-US")
                        : formatCents(rate.earned)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <p className="text-muted">
          {formatCents(entry.spentCents)} spent with this card in {year}. Set up its rewards to see
          what it earned.
        </p>
      )}
    </Panel>
  );
}
