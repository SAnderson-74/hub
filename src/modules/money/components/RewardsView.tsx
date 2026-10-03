import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { Stat } from "../../../client/components/Stat";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  ghostButton,
  iconButton,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { cardLabel } from "../../../shared/cards";
import { formatCents } from "../../../shared/money";
import {
  earnedLabel,
  pointValueLabel,
  REWARD_KIND_LABELS,
  rateLabel,
} from "../../../shared/rewards";
import type { Book, CardRewards, Category } from "../queries";
import { useRewards } from "../queries";
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
  const report = useRewards(book.id, year);
  const [editingId, setEditingId] = useState<number | null>(null);
  const editing = report.data?.cards.find((entry) => entry.card.id === editingId) ?? null;

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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label="Earned"
                value={formatCents(report.data.totals.valueCents)}
                note="Cash back, and points at their value"
              />
              <Stat
                label="Spent"
                value={formatCents(report.data.totals.spentCents)}
                note="On cards with rewards set up"
              />
              <Stat
                label="Average back"
                value={effectiveRate(report.data.totals.valueCents, report.data.totals.spentCents)}
                note="What you earned for what you spent"
              />
            </div>
          </Panel>
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
              onEdit={() => setEditingId(entry.card.id)}
            />
          ))}
        </div>
      )}

      <RewardsSheet target={editing} categories={categories} onClose={() => setEditingId(null)} />
    </div>
  );
}

function CardPanel({
  entry,
  year,
  onEdit,
}: {
  entry: CardRewards;
  year: number;
  onEdit: () => void;
}) {
  const { card, program } = entry;
  return (
    <Panel
      title={cardLabel(card)}
      description={[
        card.account.name,
        program
          ? `${REWARD_KIND_LABELS[program.kind]}${program.kind === "points" ? `, ${pointValueLabel(program.pointValue)} a point` : ""}`
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
