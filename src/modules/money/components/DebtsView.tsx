import { ArrowDown, ArrowUp } from "lucide-react";
import { type FormEvent, useId, useMemo, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { Slider } from "../../../client/components/Slider";
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
import { ACCOUNT_KIND_LABELS } from "../../../shared/books";
import { shiftMonth } from "../../../shared/budget";
import {
  aprText,
  DEBT_STRATEGIES,
  DEBT_STRATEGY_HINTS,
  DEBT_STRATEGY_LABELS,
  type Debt,
  type DebtStrategy,
  parseApr,
  payoffOrder,
  simulatePayoff,
} from "../../../shared/debt";
import { centsToInput, formatCents, parseDollars } from "../../../shared/money";
import { monthLabel } from "../../../shared/profit";
import {
  type Book,
  type DebtRow,
  type DebtsData,
  useDebts,
  useSetDebtPlan,
  useSetDebtTerms,
} from "../queries";

/** "March 2031" for the month `months` from this one. */
const monthsAhead = (today: string, months: number) =>
  monthLabel(shiftMonth(today.slice(0, 7), months), true);

/** "2 years 3 months" */
function duration(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [
    years > 0 ? `${years} ${years === 1 ? "year" : "years"}` : "",
    rest > 0 ? `${rest} ${rest === 1 ? "month" : "months"}` : "",
  ].filter(Boolean);
  return parts.join(" ") || "less than a month";
}

/** Paying off cards and loans: their rates and minimums, an order, and what extra changes. */
export function DebtsView({ book, today }: { book: Book; today: string }) {
  const debts = useDebts(book.id);
  if (debts.isPending) return <LoadingRows rows={4} />;
  if (debts.isError) {
    return <ErrorNote error={debts.error} onRetry={() => void debts.refetch()} />;
  }
  if (debts.data.debts.length === 0) {
    return (
      <Panel
        title="No debts"
        description="Credit cards and loans with a balance owed show up here, to plan paying them off."
      >
        <p className="text-muted">Nothing is owed on a card or loan in {book.name}.</p>
      </Panel>
    );
  }
  return <Planner key={book.id} book={book} data={debts.data} today={today} />;
}

function Planner({ book, data, today }: { book: Book; data: DebtsData; today: string }) {
  const [strategy, setStrategy] = useState<DebtStrategy>(data.plan.strategy);
  const [extraCents, setExtraCents] = useState(data.plan.extraCents);
  const [chosenOrder, setOrder] = useState<number[]>(data.plan.order);
  const save = useSetDebtPlan();
  const debts = useMemo(() => ready(data.debts), [data.debts]);
  // Debts not placed yet (just given a rate and minimum) go after the rest, by balance.
  const order = useMemo(
    () => payoffOrder(debts, "custom", chosenOrder).map((debt) => debt.id),
    [debts, chosenOrder],
  );
  const missing = data.debts.filter(
    (debt) => debt.aprBasisPoints === null || debt.minimumCents === null,
  );
  const plan = useMemo(
    () => simulatePayoff(debts, strategy, extraCents, order),
    [debts, strategy, extraCents, order],
  );
  const baseline = useMemo(
    () => simulatePayoff(debts, strategy, 0, order),
    [debts, strategy, order],
  );
  const others = DEBT_STRATEGIES.map((option) => ({
    option,
    result: simulatePayoff(debts, option, extraCents, order),
  }));
  const names = new Map(data.debts.map((debt) => [debt.id, debt.name]));
  const totalOwed = data.debts.reduce((sum, debt) => sum + debt.balanceCents, 0);
  const minimums = debts.reduce((sum, debt) => sum + debt.minimumCents, 0);
  const saved =
    data.plan.strategy === strategy &&
    data.plan.extraCents === extraCents &&
    (strategy !== "custom" || data.plan.order.join() === order.join());
  const sliderMax = Math.max(100_000, Math.ceil((extraCents * 1.5) / 10_000) * 10_000);
  const ids = useId();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
      <div className="grid grid-cols-2 gap-3 lg:col-span-12 lg:grid-cols-4">
        <Stat label="Owed" value={formatCents(totalOwed)} />
        <Stat
          label="Debt-free"
          value={plan.months === null ? "Not yet" : monthsAhead(today, plan.months)}
          note={
            plan.months === null
              ? "Payments don't cover the interest"
              : `In ${duration(plan.months)}`
          }
        />
        <Stat label="Interest to pay" value={formatCents(plan.interestCents)} />
        <Stat
          label="Each month"
          value={formatCents(minimums + extraCents)}
          note="Minimums plus extra"
        />
      </div>

      <Panel
        title="Your debts"
        description="Rates and minimums are on each statement."
        className="lg:col-span-5"
      >
        <ul className="space-y-3">
          {data.debts.map((debt) => (
            <TermsRow key={debt.id} debt={debt} />
          ))}
        </ul>
      </Panel>

      <Panel
        title="Payoff plan"
        description={
          missing.length > 0
            ? `Leaves out ${missing.map((debt) => debt.name).join(", ")} until the rate and minimum are in.`
            : "Extra goes to the first debt in the order; each one paid off passes its minimum on."
        }
        className="lg:col-span-7"
      >
        {debts.length === 0 ? (
          <p className="text-muted">Add a rate and minimum payment for a debt to see a plan.</p>
        ) : (
          <div className="space-y-6">
            <fieldset className="space-y-2">
              <legend className={labelClass}>Pay off</legend>
              {DEBT_STRATEGIES.map((option) => (
                <label
                  key={option}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50 has-[:checked]:ring-accent-text"
                >
                  <input
                    type="radio"
                    name={`${ids}-strategy`}
                    value={option}
                    checked={strategy === option}
                    onChange={() => setStrategy(option)}
                    className="mt-1 size-5 shrink-0 accent-accent"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-fg">
                      {DEBT_STRATEGY_LABELS[option]}
                    </span>
                    <span className="block text-sm text-muted">{DEBT_STRATEGY_HINTS[option]}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {strategy === "custom" ? (
              <section aria-label="Your order" className="space-y-2">
                <h3 className="text-sm font-semibold text-muted">Your order</h3>
                <ol className="space-y-2">
                  {order.map((debtId, index) => (
                    <li
                      key={debtId}
                      className="flex items-center justify-between gap-2 rounded-tile bg-base/80 py-1 pr-1 pl-3 ring-1 ring-surface-0/50"
                    >
                      <span className="min-w-0 break-words text-fg">
                        {index + 1}. {names.get(debtId)}
                      </span>
                      <span className="flex shrink-0">
                        <button
                          type="button"
                          className={iconButton}
                          aria-label={`Move ${names.get(debtId)} up`}
                          disabled={index === 0}
                          onClick={() => setOrder(move(order, index, -1))}
                        >
                          <ArrowUp aria-hidden="true" className="size-5" />
                        </button>
                        <button
                          type="button"
                          className={iconButton}
                          aria-label={`Move ${names.get(debtId)} down`}
                          disabled={index === order.length - 1}
                          onClick={() => setOrder(move(order, index, 1))}
                        >
                          <ArrowDown aria-hidden="true" className="size-5" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <Slider
              label="Extra each month"
              min={0}
              max={sliderMax}
              step={1_000}
              value={extraCents}
              onChange={setExtraCents}
              format={(cents) => formatCents(cents)}
              hint={whatExtraChanges(plan, baseline, extraCents)}
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={primaryButton}
                disabled={saved || save.isPending}
                onClick={() => save.mutate({ bookId: book.id, strategy, extraCents, order })}
              >
                Save plan
              </button>
              <p role="status" className="text-sm font-semibold text-ok empty:hidden">
                {save.isSuccess && saved ? "Plan saved" : ""}
              </p>
              {save.error ? (
                <p role="alert" className="w-full text-sm text-danger">
                  {save.error.message}
                </p>
              ) : null}
            </div>

            <section aria-label="Payoff dates" className="space-y-2">
              <h3 className="text-sm font-semibold text-muted">Payoff dates</h3>
              <ol className="space-y-1 text-sm">
                {plan.debts.map((result) => (
                  <li
                    key={result.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3"
                  >
                    <span className="min-w-0 break-words text-fg">{names.get(result.id)}</span>
                    <span className="text-muted tabular-nums">
                      {result.months === null
                        ? "Not paid off"
                        : `${monthsAhead(today, result.months)} · ${formatCents(result.interestCents)} interest`}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm tabular-nums">
                <caption className="mb-2 text-left text-sm font-semibold text-muted">
                  Each order with {formatCents(extraCents)} extra
                </caption>
                <thead className="text-muted">
                  <tr>
                    <th scope="col" className="py-1 font-semibold">
                      Order
                    </th>
                    <th scope="col" className="py-1 text-right font-semibold">
                      Debt-free
                    </th>
                    <th scope="col" className="py-1 text-right font-semibold">
                      Interest
                    </th>
                  </tr>
                </thead>
                <tbody className="text-fg">
                  {others.map(({ option, result }) => (
                    <tr key={option} className="border-t border-surface-0">
                      <th scope="row" className="py-1 font-normal">
                        {DEBT_STRATEGY_LABELS[option]}
                      </th>
                      <td className="py-1 text-right">
                        {result.months === null ? "Not yet" : monthsAhead(today, result.months)}
                      </td>
                      <td className="py-1 text-right">{formatCents(result.interestCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** "Paying $100 extra saves $1,200 in interest and 8 months." */
function whatExtraChanges(
  plan: ReturnType<typeof simulatePayoff>,
  baseline: ReturnType<typeof simulatePayoff>,
  extraCents: number,
): string {
  if (extraCents === 0) {
    return baseline.months === null
      ? "Minimums alone don't cover the interest. Add some extra."
      : "Move it to see what paying more each month saves.";
  }
  if (plan.months === null) return "Even with this extra, payments don't cover the interest.";
  const interest = baseline.interestCents - plan.interestCents;
  if (baseline.months === null) {
    return `With ${formatCents(extraCents)} extra, it's paid off in ${duration(plan.months)}.`;
  }
  const months = baseline.months - plan.months;
  return `${formatCents(extraCents)} extra saves ${formatCents(interest)} in interest and ${duration(months)}.`;
}

/** Debts with their rate and minimum in, ready to plan with. */
function ready(debts: DebtRow[]): Debt[] {
  return debts.flatMap((debt) =>
    debt.aprBasisPoints === null || debt.minimumCents === null
      ? []
      : [
          {
            id: debt.id,
            name: debt.name,
            balanceCents: debt.balanceCents,
            aprBasisPoints: debt.aprBasisPoints,
            minimumCents: debt.minimumCents,
          },
        ],
  );
}

function move(order: number[], index: number, by: number): number[] {
  const next = [...order];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(index + by, 0, item);
  return next;
}

function TermsRow({ debt }: { debt: DebtRow }) {
  const ids = useId();
  const save = useSetDebtTerms();
  const known = debt.aprBasisPoints !== null && debt.minimumCents !== null;
  const [editing, setEditing] = useState(!known);
  const [apr, setApr] = useState(debt.aprBasisPoints === null ? "" : aprText(debt.aprBasisPoints));
  const [minimum, setMinimum] = useState(
    debt.minimumCents === null ? "" : centsToInput(debt.minimumCents),
  );
  const [tried, setTried] = useState(false);
  const aprValue = parseApr(apr);
  const minimumValue = parseDollars(minimum);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (aprValue === null || minimumValue === null) return;
    save.mutate(
      { id: debt.id, terms: { aprBasisPoints: aprValue, minimumCents: minimumValue } },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <li className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold break-words text-fg">{debt.name}</p>
          <p className="text-sm text-muted">
            {[
              ACCOUNT_KIND_LABELS[debt.kind],
              known && debt.aprBasisPoints !== null ? `${aprText(debt.aprBasisPoints)}%` : "",
              known && debt.minimumCents !== null
                ? `${formatCents(debt.minimumCents)} minimum`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="shrink-0 font-semibold text-fg tabular-nums">
          {formatCents(debt.balanceCents)}
        </span>
      </div>
      {editing ? (
        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${ids}-apr`} className={labelClass}>
                Yearly rate (%)
              </label>
              <input
                id={`${ids}-apr`}
                value={apr}
                inputMode="decimal"
                autoComplete="off"
                placeholder="24.99"
                onChange={(event) => setApr(event.target.value)}
                aria-invalid={tried && aprValue === null}
                className={`${inputClass} tabular-nums`}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-minimum`} className={labelClass}>
                Minimum payment
              </label>
              <input
                id={`${ids}-minimum`}
                value={minimum}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                onChange={(event) => setMinimum(event.target.value)}
                aria-invalid={tried && minimumValue === null}
                className={`${inputClass} tabular-nums`}
              />
            </div>
          </div>
          {tried && (aprValue === null || minimumValue === null) ? (
            <p className="text-sm text-danger">Use a rate like 24.99 and a minimum like 35.</p>
          ) : null}
          {save.error ? (
            <p role="alert" className="text-sm text-danger">
              {save.error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={secondaryButton} disabled={save.isPending}>
              Save terms
            </button>
            {known ? (
              <button type="button" className={ghostButton} onClick={() => setEditing(false)}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <button
          type="button"
          className={`${ghostButton} -ml-3`}
          aria-label={`Change terms for ${debt.name}`}
          onClick={() => setEditing(true)}
        >
          Change terms
        </button>
      )}
    </li>
  );
}
