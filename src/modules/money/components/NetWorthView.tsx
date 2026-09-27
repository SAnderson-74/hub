import { Plus } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { primaryButton } from "../../../client/components/ui";
import { ACCOUNT_KIND_LABELS } from "../../../shared/books";
import { formatCents } from "../../../shared/money";
import {
  NET_WORTH_RANGE_LABELS,
  NET_WORTH_RANGES,
  type NetWorthRange,
  netWorthSummary,
} from "../../../shared/netWorth";
import { formatSigned, monthLabel } from "../../../shared/profit";
import { type Book, type NetWorth, useNetWorth } from "../queries";
import { Stat } from "./Stat";

// The chart loads on demand, so the rest of the app doesn't carry the chart library.
const NetWorthChart = lazy(() =>
  import("./NetWorthChart").then((module) => ({ default: module.NetWorthChart })),
);

const RANGE_KEY = "hub.money.netWorth.range";
const SCOPE_KEY = "hub.money.netWorth.scope";
type Scope = "all" | "book";

function stored<T extends string | number>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return allowed.find((option) => String(option) === value) ?? fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: string | number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Private browsing; the choice still applies to this visit.
  }
}

/** A row of pill radios, like the view switch above. */
function Choice<T extends string | number>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 max-w-full overflow-x-auto rounded-full bg-mantle p-1 ring-1 ring-surface-0/60">
      <legend className="sr-only">{legend}</legend>
      {options.map(([option, label]) => (
        <label key={String(option)} className="relative shrink-0">
          <input
            type="radio"
            name={name}
            value={String(option)}
            checked={option === value}
            onChange={() => onChange(option)}
            className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
          />
          <span className="pointer-events-none flex h-10 items-center rounded-full px-4 text-sm font-semibold text-muted peer-checked:bg-surface-0 peer-checked:text-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text">
            {label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Net worth over time: every account added up at the end of each month. */
export function NetWorthView({
  book,
  books,
  today,
  onAddAccount,
}: {
  book: Book;
  books: Book[];
  today: string;
  onAddAccount: () => void;
}) {
  const [range, setRange] = useState<NetWorthRange>(() => stored(RANGE_KEY, NET_WORTH_RANGES, 12));
  const [scope, setScope] = useState<Scope>(() => stored(SCOPE_KEY, ["all", "book"], "all"));
  const several = books.length > 1;
  const oneBook = several && scope === "book";
  const worth = useNetWorth(today, range, oneBook ? book.id : null);

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Choice
          legend="Time range"
          options={NET_WORTH_RANGES.map((value) => [value, NET_WORTH_RANGE_LABELS[value]] as const)}
          value={range}
          onChange={(value) => {
            setRange(value);
            remember(RANGE_KEY, value);
          }}
        />
        {several ? (
          <Choice<Scope>
            legend="Books to count"
            options={[
              ["all", "All books"],
              ["book", `${book.name} only`],
            ]}
            value={scope}
            onChange={(value) => {
              setScope(value);
              remember(SCOPE_KEY, value);
            }}
          />
        ) : null}
      </div>

      {worth.isPending ? (
        <LoadingRows rows={4} />
      ) : worth.isError ? (
        <ErrorNote error={worth.error} onRetry={() => void worth.refetch()} />
      ) : worth.data.accountCount === 0 ? (
        <Panel
          title="No accounts yet"
          description="Net worth adds up the balances of your accounts, minus what you owe."
        >
          <button type="button" className={primaryButton} onClick={onAddAccount}>
            <Plus aria-hidden="true" className="size-5" />
            Add account
          </button>
        </Panel>
      ) : (
        <div
          className={`grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6 ${
            worth.isPlaceholderData ? "opacity-60" : ""
          }`}
        >
          <Overview data={worth.data} />
          <Panel
            title="Net worth over time"
            description="At the end of each month, with money owed subtracted. Before an account's first entered balance, that balance stands in."
            className="lg:col-span-8"
          >
            {worth.data.points.length > 1 ? (
              <Suspense fallback={<LoadingRows rows={3} />}>
                <NetWorthChart
                  points={worth.data.points}
                  summary={netWorthSummary(worth.data.points)}
                />
              </Suspense>
            ) : (
              <p className="text-sm text-muted">{netWorthSummary(worth.data.points)}</p>
            )}
          </Panel>
          <Panel title="Where it is" className="lg:col-span-4">
            <Breakdown data={worth.data} showBooks={several && !oneBook} />
          </Panel>
        </div>
      )}
    </div>
  );
}

function Overview({ data }: { data: NetWorth }) {
  const first = data.points[0];
  const last = data.points.at(-1);
  if (!first || !last) return null;
  const change = last.netCents - first.netCents;
  return (
    <div className="grid grid-cols-2 gap-3 lg:col-span-12 lg:grid-cols-4">
      <Stat label="Net worth" value={formatSigned(last.netCents)} />
      <Stat label="Assets" value={formatCents(last.assetsCents)} />
      <Stat label="Debts" value={formatCents(last.debtsCents)} />
      {data.points.length > 1 ? (
        <Stat
          label="Change"
          value={change > 0 ? `+${formatCents(change)}` : formatSigned(change)}
          note={`Since the end of ${monthLabel(first.month, true)}`}
        />
      ) : null}
    </div>
  );
}

function Breakdown({ data, showBooks }: { data: NetWorth; showBooks: boolean }) {
  const assets = data.accounts.filter((account) => account.balanceCents > 0);
  const debts = data.accounts.filter((account) => account.balanceCents < 0);
  if (assets.length === 0 && debts.length === 0) {
    return <p className="text-sm text-muted">Every account is at zero.</p>;
  }
  return (
    <div className="space-y-5">
      {(
        [
          ["Assets", assets],
          ["Debts", debts],
        ] as const
      ).map(([title, rows]) =>
        rows.length === 0 ? null : (
          <section key={title} aria-label={title}>
            <h3 className="text-sm font-semibold text-muted">{title}</h3>
            <ul className="mt-1 divide-y divide-surface-0">
              {rows.map((account) => (
                <li key={account.id} className="flex items-baseline justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="break-words text-fg">{account.name}</p>
                    <p className="text-sm text-muted">
                      {[
                        showBooks ? account.bookName : "",
                        ACCOUNT_KIND_LABELS[account.kind],
                        account.archived ? "Archived" : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-fg tabular-nums">
                    {formatCents(Math.abs(account.balanceCents))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
