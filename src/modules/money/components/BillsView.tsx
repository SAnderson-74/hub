import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  ghostButton,
  iconButton,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import {
  BILL_FREQUENCY_LABELS,
  BILL_KIND_LABELS,
  type BillKind,
  billDates,
  nextBillDate,
} from "../../../shared/bills";
import { formatCents } from "../../../shared/money";
import { addMonths } from "../../../shared/recurrence";
import { formatShortDate } from "../../tasks/dates";
import {
  type Account,
  type Bill,
  type Book,
  type Category,
  useBills,
  useDismissBill,
  useUpdateBill,
} from "../queries";
import { BillSheet, type BillTarget } from "./BillSheet";

const KIND_ORDER: BillKind[] = ["bill", "subscription", "income"];
const SECTION: Record<BillKind, string> = {
  bill: "Bills",
  subscription: "Subscriptions",
  income: "Income",
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "About $1,250 a month out, $4,000 in, subscriptions cost $380 a year." */
function totalsText(data: {
  monthlyOutCents: number;
  monthlyInCents: number;
  subscriptionsPerYearCents: number;
}): string {
  const parts = [
    `About ${formatCents(data.monthlyOutCents)} a month out`,
    data.monthlyInCents > 0 ? `${formatCents(data.monthlyInCents)} in` : "",
    data.subscriptionsPerYearCents > 0
      ? `subscriptions cost ${formatCents(data.subscriptionsPerYearCents)} a year`
      : "",
  ];
  return `${parts.filter(Boolean).join(", ")}.`;
}

/** "$15.99 every month" */
const cadence = (amountCents: number, frequency: Bill["frequency"]) =>
  `${formatCents(amountCents)} ${BILL_FREQUENCY_LABELS[frequency].toLowerCase()}`;

/**
 * Bills, subscriptions, and repeating income: what needs a look (price changes and
 * ones that didn't come), repeating payments to confirm, a month calendar, and the list.
 */
export function BillsView({
  book,
  accounts,
  categories,
  today,
}: {
  book: Book;
  accounts: Account[];
  categories: Category[];
  today: string;
}) {
  const bills = useBills(book.id);
  const update = useUpdateBill();
  const dismiss = useDismissBill();
  const [target, setTarget] = useState<BillTarget>(null);
  const [message, setMessage] = useState("");

  if (bills.isPending) return <LoadingRows rows={4} />;
  if (bills.isError) return <ErrorNote error={bills.error} onRetry={() => void bills.refetch()} />;
  const data = bills.data;
  const alerts = data.bills.filter((bill) => bill.alert !== null);
  const actionError = update.error ?? dismiss.error;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
      <div className="space-y-4 lg:col-span-7">
        <p role="status" className={message ? "text-sm font-semibold text-ok" : "sr-only"}>
          {message}
        </p>
        {actionError ? (
          <p role="alert" className="text-sm text-danger">
            {actionError.message}
          </p>
        ) : null}

        {alerts.length > 0 ? (
          <Panel title="Needs a look" description="Price changes and payments that didn't come.">
            <ul className="space-y-2">
              {alerts.map((bill) => (
                <li key={bill.id} className="rounded-tile bg-base/80 p-4 ring-1 ring-warn/40">
                  {bill.alert?.kind === "changed" ? (
                    <>
                      <p className="font-semibold text-fg">
                        {bill.name} went {bill.alert.toCents > bill.alert.fromCents ? "up" : "down"}{" "}
                        from {formatCents(bill.alert.fromCents)} to{" "}
                        {formatCents(bill.alert.toCents)}
                      </p>
                      <p className="text-sm text-muted">
                        Charged {formatShortDate(bill.alert.date, today)}.
                      </p>
                      <button
                        type="button"
                        className={`${secondaryButton} mt-2`}
                        disabled={update.isPending}
                        onClick={() => {
                          const toCents =
                            bill.alert?.kind === "changed" ? bill.alert.toCents : bill.amountCents;
                          update.mutate(
                            { id: bill.id, patch: { amountCents: toCents } },
                            {
                              onSuccess: () =>
                                setMessage(`${bill.name} is now ${formatCents(toCents)}.`),
                            },
                          );
                        }}
                      >
                        Use the new amount
                      </button>
                    </>
                  ) : bill.alert?.kind === "missing" ? (
                    <>
                      <p className="font-semibold text-fg">{bill.name} hasn't come yet</p>
                      <p className="text-sm text-muted">
                        It was expected {formatShortDate(bill.alert.expected, today)}.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={secondaryButton}
                          disabled={update.isPending}
                          onClick={() => {
                            const expected =
                              bill.alert?.kind === "missing" ? bill.alert.expected : bill.nextDate;
                            update.mutate(
                              {
                                id: bill.id,
                                patch: { nextDate: nextBillDate(expected, bill.frequency) },
                              },
                              { onSuccess: () => setMessage(`Skipped this one for ${bill.name}.`) },
                            );
                          }}
                        >
                          Skip this one
                        </button>
                        <button
                          type="button"
                          className={ghostButton}
                          onClick={() => setTarget({ mode: "edit", bill })}
                        >
                          Edit bill
                        </button>
                      </div>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {data.suggestions.length > 0 ? (
          <Panel
            title="Repeating payments"
            description="These came on a schedule. Add the ones that are bills, subscriptions, or income."
          >
            <ul className="space-y-2">
              {data.suggestions.map((suggestion) => (
                <li
                  key={suggestion.matchKey}
                  className="flex flex-wrap items-center gap-2 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold break-words text-fg">{suggestion.name}</p>
                    <p className="text-sm text-muted">
                      {cadence(suggestion.amountCents, suggestion.frequency)}
                      {suggestion.kind === "income" ? " in" : ""}, next{" "}
                      {formatShortDate(suggestion.nextDate, today)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => setTarget({ mode: "confirm", suggestion })}
                    aria-label={`Add ${suggestion.name}`}
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    Add
                  </button>
                  <button
                    type="button"
                    className={ghostButton}
                    disabled={dismiss.isPending}
                    onClick={() =>
                      dismiss.mutate(
                        { bookId: book.id, matchKey: suggestion.matchKey, name: suggestion.name },
                        {
                          onSuccess: () =>
                            setMessage(`${suggestion.name} won't be suggested again.`),
                        },
                      )
                    }
                    aria-label={`${suggestion.name} isn't a bill`}
                  >
                    Not a bill
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel
          title="Bills and income"
          description={data.bills.length === 0 ? undefined : totalsText(data)}
          action={
            <button
              type="button"
              className={primaryButton}
              onClick={() => setTarget({ mode: "new" })}
            >
              <Plus aria-hidden="true" className="size-5" />
              Add a bill
            </button>
          }
        >
          {data.bills.length === 0 ? (
            <p className="text-muted">
              No bills yet. Add one, or confirm a repeating payment above once a few have come in.
            </p>
          ) : (
            <div className="space-y-5">
              {KIND_ORDER.map((kind) => {
                const list = data.bills.filter((bill) => bill.kind === kind);
                if (list.length === 0) return null;
                return (
                  <section key={kind} aria-labelledby={`bills-${kind}`}>
                    <h3 id={`bills-${kind}`} className="mb-2 font-semibold text-fg">
                      {SECTION[kind]}
                    </h3>
                    <ul className="space-y-2">
                      {list.map((bill) => (
                        <li key={bill.id}>
                          <button
                            type="button"
                            onClick={() => setTarget({ mode: "edit", bill })}
                            className="flex w-full items-start justify-between gap-3 rounded-tile bg-base/80 p-4 text-left ring-1 ring-surface-0/50 hover:ring-surface-1"
                          >
                            <span className="min-w-0">
                              <span className="block font-semibold break-words text-fg">
                                {bill.name}
                              </span>
                              <span className="block text-sm text-muted">
                                {[
                                  `Next ${formatShortDate(bill.nextDate, today)}`,
                                  BILL_FREQUENCY_LABELS[bill.frequency],
                                  bill.accountName ?? "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                            <span className="shrink-0 font-semibold text-fg tabular-nums">
                              {bill.kind === "income" ? "+" : ""}
                              {formatCents(bill.amountCents)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <BillCalendar bills={data.bills} today={today} className="lg:col-span-5" />

      <BillSheet
        bookId={book.id}
        target={target}
        accounts={accounts}
        categories={categories}
        today={today}
        onClose={() => setTarget(null)}
        onSaved={(said) => {
          setTarget(null);
          setMessage(said);
        }}
      />
    </div>
  );
}

/** A month of bills: each day shows how many are due; picking a day lists them. */
function BillCalendar({
  bills,
  today,
  className,
}: {
  bills: Bill[];
  today: string;
  className?: string;
}) {
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [picked, setPicked] = useState<string | null>(null);
  const last = addMonths(month, 1);
  const lastDay = new Date(`${last}T00:00:00Z`);
  lastDay.setUTCDate(0);
  const end = lastDay.toISOString().slice(0, 10);
  const byDay = new Map<string, Bill[]>();
  for (const bill of bills) {
    for (const date of billDates(bill.nextDate, bill.frequency, month, end)) {
      byDay.set(date, [...(byDay.get(date) ?? []), bill]);
    }
  }
  const lead = new Date(`${month}T00:00:00Z`).getUTCDay();
  const days = Number(end.slice(8, 10));
  // Blanks before the 1st carry their own keys, so no cell is keyed by position.
  const cells = [
    ...Array.from({ length: lead }, (_, blank) => `blank-${WEEKDAYS[blank]}`),
    ...Array.from(
      { length: days },
      (_, index) => `${month.slice(0, 8)}${String(index + 1).padStart(2, "0")}`,
    ),
  ];
  const title = new Date(`${month}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const shown = picked ? (byDay.get(picked) ?? []) : [];
  const monthTotal = [...byDay.values()]
    .flat()
    .filter((bill) => bill.kind !== "income")
    .reduce((sum, bill) => sum + bill.amountCents, 0);

  return (
    <Panel
      title="Calendar"
      description={`${title}: ${formatCents(monthTotal)} in bills.`}
      className={className}
      action={
        <div className="-mt-2 -mr-2 flex shrink-0 items-center">
          <button
            type="button"
            className={iconButton}
            aria-label="Previous month"
            onClick={() => {
              setMonth(addMonths(month, -1));
              setPicked(null);
            }}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label="Next month"
            onClick={() => {
              setMonth(addMonths(month, 1));
              setPicked(null);
            }}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => (
          <div key={day} aria-hidden="true" className="pb-1 text-xs font-semibold text-muted">
            {day}
          </div>
        ))}
        {cells.map((date) => {
          if (date.startsWith("blank-")) return <div key={date} />;
          const due = byDay.get(date) ?? [];
          const label = `${formatShortDate(date, today)}: ${
            due.length === 0 ? "no bills" : due.map((bill) => bill.name).join(", ")
          }`;
          return (
            <button
              key={date}
              type="button"
              aria-label={label}
              aria-pressed={picked === date}
              onClick={() => setPicked(picked === date ? null : date)}
              className={`flex min-h-11 flex-col items-center justify-center rounded-control text-sm tabular-nums ${
                picked === date
                  ? "bg-surface-1 text-fg"
                  : date === today
                    ? "ring-1 ring-accent-text"
                    : "hover:bg-surface-0"
              } ${due.length > 0 ? "font-semibold text-fg" : "text-muted"}`}
            >
              {Number(date.slice(8, 10))}
              {due.length > 0 ? (
                <span aria-hidden="true" className="text-[10px] leading-none text-accent-text">
                  {due.length === 1 ? "•" : `${due.length}•`}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {picked ? (
        <div className="mt-4">
          <h3 className="mb-2 font-semibold text-fg">{formatShortDate(picked, today)}</h3>
          {shown.length === 0 ? (
            <p className="text-sm text-muted">Nothing due.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {shown.map((bill) => (
                <li key={bill.id} className="flex justify-between gap-3">
                  <span className="min-w-0 break-words text-fg">
                    {bill.name}
                    <span className="text-muted"> · {BILL_KIND_LABELS[bill.kind]}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-fg">
                    {bill.kind === "income" ? "+" : ""}
                    {formatCents(bill.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Panel>
  );
}
