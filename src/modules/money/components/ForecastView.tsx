import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useId, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { inputClass, labelClass, secondaryButton } from "../../../client/components/ui";
import { useSaveSettings, useSettings } from "../../../client/lib/queries";
import { FORECAST_DAYS } from "../../../shared/bills";
import { centsToInput, formatCents, parseDollars } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";
import { daysBetween } from "../../../shared/recurrence";
import { formatShortDate } from "../../tasks/dates";
import { type Book, type Forecast, useForecast } from "../queries";

const ForecastChart = lazy(() =>
  import("./ForecastChart").then((module) => ({ default: module.ForecastChart })),
);

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "Checking could fall below $100 on Oct 28, two days before Paycheck." */
function warningText(
  account: Forecast["accounts"][number],
  lowCents: number,
  today: string,
): string {
  const warning = account.warning;
  if (!warning) return "";
  const base = `${account.name} could fall below ${formatCents(lowCents)} on ${formatShortDate(warning.date, today)}`;
  if (!warning.nextIncome) return `${base}.`;
  const gap = daysBetween(warning.date, warning.nextIncome.date);
  return `${base}, ${plural(gap, "day", "days")} before ${warning.nextIncome.name}.`;
}

/** Each account's expected balance ahead, from bills and income on their schedules. */
export function ForecastView({ book, today }: { book: Book; today: string }) {
  const ids = useId();
  const [days, setDays] = useState<number>(30);
  const forecast = useForecast(book.id, days);
  const [chosen, setChosen] = useState<number | null>(null);

  if (forecast.isPending) return <LoadingRows rows={4} />;
  if (forecast.isError) {
    return <ErrorNote error={forecast.error} onRetry={() => void forecast.refetch()} />;
  }
  const data = forecast.data;
  const account = data.accounts.find((item) => item.id === chosen) ?? data.accounts[0];
  const warnings = data.accounts.filter((item) => item.warning !== null);
  const points = account
    ? data.series.map((row) => ({
        date: row.date,
        label: formatShortDate(row.date, today),
        balanceCents: (row.balances as Record<string, number>)[String(account.id)] ?? 0,
      }))
    : [];
  const upcoming = data.events
    .filter((event) => !account || event.accountId === account.id)
    .slice(0, 12);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
      <Panel
        title="Forecast"
        description="Today's balances plus bills and income on their schedules."
        className="lg:col-span-8"
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <fieldset className="flex rounded-full bg-mantle p-1 ring-1 ring-surface-0/60">
            <legend className="sr-only">How far ahead</legend>
            {FORECAST_DAYS.map((value) => (
              <label key={value} className="relative">
                <input
                  type="radio"
                  name="forecast-days"
                  value={value}
                  checked={days === value}
                  onChange={() => setDays(value)}
                  className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
                />
                <span className="pointer-events-none flex h-10 items-center rounded-full px-4 text-sm font-semibold text-muted peer-checked:bg-surface-0 peer-checked:text-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text">
                  {value} days
                </span>
              </label>
            ))}
          </fieldset>
          {data.accounts.length > 1 ? (
            <div>
              <label htmlFor={`${ids}-account`} className={labelClass}>
                Account
              </label>
              <select
                id={`${ids}-account`}
                value={String(account?.id ?? "")}
                onChange={(event) => setChosen(Number(event.target.value))}
                className={`${inputClass} max-w-56`}
              >
                {data.accounts.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {!account ? (
          <p className="text-muted">
            Add a checking, savings, cash, or card account to see a forecast.
          </p>
        ) : (
          <>
            <Suspense fallback={<LoadingRows rows={3} />}>
              <ForecastChart
                points={points}
                lowCents={data.lowCents}
                summary={`${account.name}: ${formatSigned(account.startCents)} today, about ${formatSigned(
                  account.endCents,
                )} in ${days} days, lowest ${formatSigned(account.lowest.balanceCents)} on ${formatShortDate(
                  account.lowest.date,
                  today,
                )}.`}
              />
            </Suspense>
            <div className="sr-only">
              <table>
                <caption>{account.name}: expected balance by day</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.date}>
                      <td>{point.label}</td>
                      <td>{formatSigned(point.balanceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {data.unassigned.length > 0 ? (
          <p className="mt-3 text-sm text-muted">
            Left out because they have no account:{" "}
            {data.unassigned.map((bill) => bill.name).join(", ")}. Pick an account for each on
            Bills.
          </p>
        ) : null}
      </Panel>

      <div className="space-y-4 lg:col-span-4">
        <Panel title="Warnings">
          {warnings.length === 0 ? (
            <p className="text-sm text-muted">
              No account is expected to fall below {formatCents(data.lowCents)} in the next {days}{" "}
              days.
            </p>
          ) : (
            <ul className="space-y-2">
              {warnings.map((item) => (
                <li
                  key={item.id}
                  className="rounded-tile bg-base/80 p-3 text-sm text-fg ring-1 ring-warn/40"
                >
                  {warningText(item, data.lowCents, today)}
                </li>
              ))}
            </ul>
          )}
          <LowBalance />
        </Panel>
        <Panel title="Coming up">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">No bills or income with an account in this window.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {upcoming.map((event) => (
                <li
                  key={`${event.date}-${event.accountId}-${event.name}`}
                  className="flex justify-between gap-3"
                >
                  <span className="min-w-0 break-words text-fg">
                    {formatShortDate(event.date, today)} · {event.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-fg">
                    {formatSigned(event.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** The balance the forecast warns below. */
function LowBalance() {
  const ids = useId();
  const settings = useSettings();
  const save = useSaveSettings();
  const queryClient = useQueryClient();
  const saved = settings.data?.moneyForecast.lowCents;
  const [text, setText] = useState<string | null>(null);
  const value = text ?? (saved === undefined ? "" : centsToInput(saved));
  const cents = parseDollars(value);
  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (cents === null) return;
        save.mutate(
          { moneyForecast: { lowCents: cents } },
          {
            onSuccess: () => {
              setText(null);
              // The warnings are worked out against this amount on the server.
              void queryClient.invalidateQueries({ queryKey: ["money", "forecast"] });
            },
          },
        );
      }}
    >
      <div>
        <label htmlFor={`${ids}-low`} className={labelClass}>
          Warn below
        </label>
        <input
          id={`${ids}-low`}
          inputMode="decimal"
          value={value}
          onChange={(event) => setText(event.target.value)}
          aria-invalid={value !== "" && cents === null}
          className={`${inputClass} max-w-32`}
        />
      </div>
      <button type="submit" className={secondaryButton} disabled={cents === null || save.isPending}>
        Save amount
      </button>
      <p role="status" className={save.isSuccess ? "w-full text-sm text-ok" : "sr-only"}>
        {save.isSuccess ? "Amount saved" : ""}
      </p>
    </form>
  );
}
