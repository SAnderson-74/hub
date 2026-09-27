import { ExternalLink, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { Stat } from "../../../client/components/Stat";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { inputClass, labelClass } from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { formatCents } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";
import { useItems } from "../../resale/queries";
import { formatLongDate, formatShortDate, localDate } from "../../tasks/dates";
import {
  aboutDollars,
  estimatedTaxDates,
  type ResaleYear,
  resaleYear,
  resaleYears,
  setAside,
  setAsideSummary,
  TAX_BRACKETS,
  type TaxBracket,
} from "../estimate";
import { isStale, TAX_LESSONS, type TaxLesson } from "../lessons";

const BRACKET_KEY = "hub.taxes.bracket";

function storedBracket(): TaxBracket {
  try {
    const value = Number(localStorage.getItem(BRACKET_KEY));
    return TAX_BRACKETS.find((bracket) => bracket === value) ?? 22;
  } catch {
    return 22;
  }
}

/** Resale income by tax year, a set-aside estimate, and plain-language lessons. */
export function TaxesPage() {
  const today = localDate(useNow());
  const currentYear = Number(today.slice(0, 4));
  const items = useItems();
  const [chosenYear, setChosenYear] = useState(currentYear);
  const years = resaleYears(items.data ?? [], currentYear);
  const year = years.includes(chosenYear) ? chosenYear : currentYear;
  const ids = useId();

  return (
    <>
      <PageHeader
        title="Taxes"
        subtitle="US federal basics for resale income. Education, not tax advice."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="flex flex-wrap items-center gap-3 lg:col-span-12">
          <label htmlFor={`${ids}-year`} className="text-sm font-semibold text-muted">
            Tax year
          </label>
          <div className="w-36">
            <select
              id={`${ids}-year`}
              value={year}
              onChange={(event) => setChosenYear(Number(event.target.value))}
              className={inputClass}
            >
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        {items.isPending ? (
          <div className="lg:col-span-12">
            <LoadingRows rows={3} />
          </div>
        ) : items.isError ? (
          <div className="lg:col-span-12">
            <ErrorNote error={items.error} onRetry={() => void items.refetch()} />
          </div>
        ) : (
          <>
            <ResaleIncome summary={resaleYear(items.data, year)} soFar={year === currentYear} />
            <SetAsidePanel summary={resaleYear(items.data, year)} today={today} />
          </>
        )}

        <Panel
          title="Lessons"
          description="Short explanations of the federal rules that touch a resale side business, each with its sources."
          className="lg:col-span-12"
        >
          <div className="divide-y divide-surface-0">
            {TAX_LESSONS.map((lesson) => (
              <Lesson key={lesson.id} lesson={lesson} today={today} />
            ))}
          </div>
        </Panel>

        <p className="text-sm text-muted lg:col-span-12">
          General education about US federal taxes, not tax advice. It leaves out state and local
          taxes and doesn't know the rest of your tax picture. For decisions about your own taxes,
          check IRS.gov or a tax professional.
        </p>
      </div>
    </>
  );
}

function ResaleIncome({ summary, soFar }: { summary: ResaleYear; soFar: boolean }) {
  const notes = [
    summary.unpriced > 0
      ? `${summary.unpriced} sold ${summary.unpriced === 1 ? "item has" : "items have"} no purchase price, so profit may be high.`
      : "",
    summary.missingSalePrice > 0
      ? `${summary.missingSalePrice} sold ${summary.missingSalePrice === 1 ? "item has" : "items have"} no sale price and ${summary.missingSalePrice === 1 ? "isn't" : "aren't"} counted.`
      : "",
    summary.undated > 0
      ? `${summary.undated} sold ${summary.undated === 1 ? "item has" : "items have"} no sale date, so ${summary.undated === 1 ? "it's" : "they're"} in no year.`
      : "",
  ].filter(Boolean);
  return (
    <Panel
      title={`Resale income${soFar ? " so far" : ""} in ${summary.year}`}
      description="Sales, minus what the sold items cost and the fees, shipping, parts, and supplies on them. Expenses not tied to an item aren't included."
      className="lg:col-span-7"
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Sales"
          value={formatCents(summary.salesCents)}
          note={`${summary.sold} ${summary.sold === 1 ? "item" : "items"} sold`}
        />
        <Stat
          label="Items sold cost"
          value={formatCents(summary.itemCostCents)}
          note="What you paid for them"
        />
        <Stat
          label="Other costs"
          value={formatCents(summary.otherCostCents)}
          note="Fees, shipping, parts, supplies"
        />
        <Stat label="Profit" value={formatSigned(summary.profitCents)} />
      </div>
      {summary.onHand > 0 ? (
        <p className="mt-3 text-sm text-muted">
          {summary.onHand} {summary.onHand === 1 ? "item" : "items"} bought in {summary.year}{" "}
          {summary.onHand === 1 ? "hasn't" : "haven't"} sold ({formatCents(summary.onHandCents)}).
          That's inventory, and its cost counts in the year it sells.
        </p>
      ) : null}
      {notes.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-warn">
          {notes.map((note) => (
            <li key={note} className="flex gap-2">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

function SetAsidePanel({ summary, today }: { summary: ResaleYear; today: string }) {
  const ids = useId();
  const [bracket, setBracket] = useState<TaxBracket>(storedBracket);
  const result = setAside(summary.profitCents, bracket, summary.year);
  const choose = (value: TaxBracket) => {
    setBracket(value);
    try {
      localStorage.setItem(BRACKET_KEY, String(value));
    } catch {
      // Private browsing; the choice still applies to this visit.
    }
  };

  return (
    <Panel
      title="Set aside for federal tax"
      description="A rough amount for this profit, so the bill isn't a surprise."
      className="lg:col-span-5"
    >
      <label htmlFor={`${ids}-bracket`} className={labelClass}>
        Your income tax bracket
      </label>
      <select
        id={`${ids}-bracket`}
        value={bracket}
        onChange={(event) => choose(Number(event.target.value) as TaxBracket)}
        aria-describedby={`${ids}-bracket-hint`}
        className={inputClass}
      >
        {TAX_BRACKETS.map((option) => (
          <option key={option} value={option}>
            {option}%
          </option>
        ))}
      </select>
      <p id={`${ids}-bracket-hint`} className="mt-1.5 text-sm text-muted">
        The top rate your total taxable income reaches.{" "}
        <a
          href="https://www.irs.gov/filing/federal-income-tax-rates-and-brackets"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-accent-text underline-offset-4 hover:underline"
        >
          Find it on IRS.gov
        </a>
      </p>

      <p className="mt-4 text-lg font-semibold text-fg" aria-live="polite">
        {setAsideSummary(result)}
      </p>
      {result.share === null ? null : (
        <dl className="mt-2 divide-y divide-surface-0 text-sm">
          <div className="flex justify-between gap-3 py-2">
            <dt className="text-muted">Self-employment tax</dt>
            <dd className="font-semibold text-fg tabular-nums">
              {aboutDollars(result.selfEmploymentCents)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-2">
            <dt className="text-muted">Income tax at {bracket}%</dt>
            <dd className="font-semibold text-fg tabular-nums">
              {aboutDollars(result.incomeTaxCents)}
            </dd>
          </div>
        </dl>
      )}
      <ul className="mt-2 space-y-1 text-sm text-muted">
        {result.underMinimum ? (
          <li>Net earnings are under $400, so there's no self-employment tax on them.</li>
        ) : null}
        {result.overWageBase ? (
          <li>
            Earnings pass the year's Social Security limit, so this runs high. Schedule SE has the
            exact amount.
          </li>
        ) : null}
        <li>
          Self-employment tax is 15.3% of 92.35% of profit. Income tax is your bracket on profit
          less half of that. Deductions and credits that could lower it, like the qualified business
          income deduction, are left out, as are state and local taxes.
        </li>
      </ul>

      <h3 className="mt-5 text-sm font-semibold text-muted">
        Estimated payments for {summary.year}
      </h3>
      <ul className="mt-1 grid grid-cols-2 gap-x-3 text-sm text-fg">
        {estimatedTaxDates(summary.year).map((date) => (
          <li key={date} className={`py-1 ${date < today ? "text-faint" : ""}`}>
            {formatShortDate(date, today)}
            {date < today ? " (passed)" : ""}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-sm text-muted">
        Due when you expect to owe $1,000 or more. See the lesson on estimated tax below.
      </p>
    </Panel>
  );
}

function Lesson({ lesson, today }: { lesson: TaxLesson; today: string }) {
  const stale = isStale(lesson.reviewedOn, today);
  return (
    <details className="group py-1">
      <summary className="flex min-h-11 cursor-pointer list-none flex-col justify-center py-2 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-fg">{lesson.title}</span>
        <span className="text-sm text-muted">{lesson.summary}</span>
      </summary>
      <div className="space-y-3 pt-1 pb-4 text-fg">
        {lesson.body.map((block) =>
          block.kind === "text" ? (
            <p key={block.text}>{block.text}</p>
          ) : (
            <ul key={block.items.join()} className="list-disc space-y-1 pl-5">
              {block.items.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          ),
        )}
        <div>
          <h4 className="text-sm font-semibold text-muted">Sources</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {lesson.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 font-semibold break-words text-accent-text underline-offset-4 hover:underline"
                >
                  {source.title}
                  <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </div>
        <p className={`text-sm ${stale ? "text-warn" : "text-muted"}`}>
          Reviewed {formatLongDate(lesson.reviewedOn)}.
          {stale ? " That's over a year ago and rules change, so check the sources." : ""}
        </p>
      </div>
    </details>
  );
}
