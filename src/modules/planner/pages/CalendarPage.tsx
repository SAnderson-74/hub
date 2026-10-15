import {
  Banknote,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Flag,
  GraduationCap,
  ListTodo,
  type LucideIcon,
  Receipt,
  Target,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { ghostButton, iconButton } from "../../../client/components/ui";
import { WEEKDAY_SHORT } from "../../../shared/habits";
import { CALENDAR_KIND_LABELS } from "../../../shared/planner";
import { formatShortDate, localDate } from "../../tasks/dates";
import { monthGrid, monthLabel, monthOf, shiftMonth } from "../month";
import { type CalendarItem, useCalendar } from "../queries";

const KIND_ICONS: Record<string, LucideIcon> = {
  task: ListTodo,
  goal: Target,
  milestone: Flag,
  assessment: GraduationCap,
  "business step": Briefcase,
  lead: UserRound,
  bill: Receipt,
  income: Banknote,
};

/** How many titles a day shows in the grid on wide screens before "N more". */
const SHOWN_PER_DAY = 2;

const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;

/** Everything dated, a month at a time: tasks, goals, milestones, assessments, bills, and leads. */
export function CalendarPage() {
  // Until a month is picked, the one with today in it, by Hub's time zone once known.
  const [serverToday, setServerToday] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const today = serverToday ?? localDate();
  const month = chosen ?? monthOf(today);
  const grid = monthGrid(month);
  const calendar = useCalendar(grid.from, grid.to);
  const answered = calendar.data?.today ?? null;
  if (answered !== null && answered !== serverToday) setServerToday(answered);
  const items = calendar.data?.items ?? [];
  const byDate = new Map<string, CalendarItem[]>();
  for (const item of items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  const inMonth = items.filter((item) => monthOf(item.date) === month);

  const go = (next: string) => {
    setChosen(next);
    setSelected(null);
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={
          calendar.data ? `${things(inMonth.length)} dated in ${monthLabel(month)}` : undefined
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        <Panel
          title={monthLabel(month)}
          className="lg:col-span-7"
          action={
            <div className="-mt-2 -mr-2 flex shrink-0 items-center">
              <button
                type="button"
                className={iconButton}
                aria-label="Previous month"
                onClick={() => go(shiftMonth(month, -1))}
              >
                <ChevronLeft aria-hidden="true" className="size-5" />
              </button>
              <button
                type="button"
                className={iconButton}
                aria-label="Next month"
                onClick={() => go(shiftMonth(month, 1))}
              >
                <ChevronRight aria-hidden="true" className="size-5" />
              </button>
            </div>
          }
        >
          {monthOf(today) !== month ? (
            <button
              type="button"
              className={`${ghostButton} -mt-3 mb-2 -ml-4`}
              onClick={() => go(monthOf(today))}
            >
              Back to this month
            </button>
          ) : null}
          {calendar.isError ? (
            <ErrorNote error={calendar.error} onRetry={() => void calendar.refetch()} />
          ) : (
            <div>
              {/* Wider than the panel's padding on phones, so each day is a 44px target. */}
              <div
                aria-hidden="true"
                className="-mx-2 mb-1 grid grid-cols-7 gap-0.5 text-center lg:mx-0 lg:gap-1"
              >
                {WEEKDAY_SHORT.map((day) => (
                  <span key={day} className="text-xs font-semibold text-faint">
                    {day}
                  </span>
                ))}
              </div>
              <ol
                aria-label={`Days in ${monthLabel(month)}`}
                className="-mx-2 grid grid-cols-7 gap-0.5 lg:mx-0 lg:gap-1"
              >
                {grid.weeks.flat().map((date) => {
                  const dayItems = byDate.get(date) ?? [];
                  const outside = monthOf(date) !== month;
                  const isSelected = selected === date;
                  const isToday = date === today;
                  return (
                    <li key={date} className="min-w-0">
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={`${formatShortDate(date, today)}${isToday ? " (today)" : ""}: ${
                          dayItems.length === 0 ? "nothing dated" : things(dayItems.length)
                        }`}
                        onClick={() => setSelected(isSelected ? null : date)}
                        className={`flex min-h-12 w-full flex-col items-center gap-1 rounded-control p-1 text-left lg:min-h-24 lg:items-stretch lg:p-1.5 ${
                          isSelected
                            ? "bg-surface-1 ring-2 ring-accent-text"
                            : isToday
                              ? "bg-base ring-1 ring-accent"
                              : "bg-base/60 ring-1 ring-surface-0/50 hover:bg-surface-0"
                        }`}
                      >
                        <span
                          className={`text-sm tabular-nums ${
                            isToday
                              ? "font-bold text-accent-text"
                              : outside
                                ? "text-faint"
                                : "font-semibold text-fg"
                          }`}
                        >
                          {Number(date.slice(8))}
                        </span>
                        {dayItems.length > 0 ? (
                          <>
                            {/* Phones: a count. Wide screens: the first titles. */}
                            <span className="rounded-full bg-accent/20 px-1.5 text-xs font-semibold text-accent-text tabular-nums lg:hidden">
                              {dayItems.length}
                            </span>
                            <span className="hidden min-w-0 space-y-0.5 lg:block">
                              {dayItems.slice(0, SHOWN_PER_DAY).map((item) => (
                                <span
                                  key={item.key}
                                  className={`block truncate rounded-full px-1.5 text-xs ${
                                    outside ? "text-faint" : "bg-surface-0 text-fg"
                                  }`}
                                >
                                  {item.title}
                                </span>
                              ))}
                              {dayItems.length > SHOWN_PER_DAY ? (
                                <span className="block px-1 text-xs text-muted">
                                  {dayItems.length - SHOWN_PER_DAY} more
                                </span>
                              ) : null}
                            </span>
                          </>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </Panel>

        <Agenda
          items={selected ? (byDate.get(selected) ?? []) : inMonth}
          selected={selected}
          month={month}
          today={today}
          loading={calendar.isPending}
          onShowMonth={() => setSelected(null)}
        />
      </div>
    </>
  );
}

/** The selected day's things, or the month's, by day, each linking to where it lives. */
function Agenda({
  items,
  selected,
  month,
  today,
  loading,
  onShowMonth,
}: {
  items: CalendarItem[];
  selected: string | null;
  month: string;
  today: string;
  loading: boolean;
  onShowMonth: () => void;
}) {
  const days = new Map<string, CalendarItem[]>();
  for (const item of items) days.set(item.date, [...(days.get(item.date) ?? []), item]);

  return (
    <Panel
      title={selected ? formatShortDate(selected, today) : `All of ${monthLabel(month)}`}
      description={selected ? things(items.length) : "Pick a day to see only that day."}
      className="lg:col-span-5"
      action={
        selected ? (
          <button type="button" className={`${ghostButton} -mt-2 -mr-3`} onClick={onShowMonth}>
            Show the month
          </button>
        ) : null
      }
    >
      {loading ? (
        <LoadingRows rows={3} />
      ) : items.length === 0 ? (
        <p className="text-muted">
          {selected ? "Nothing dated on this day." : "Nothing dated this month."}
        </p>
      ) : (
        <div className="space-y-5">
          {[...days.entries()].map(([date, dayItems]) => (
            <section key={date} aria-label={formatShortDate(date, today)}>
              {selected ? null : (
                <h3 className="mb-1 text-sm font-semibold text-muted">
                  {formatShortDate(date, today)}
                  {date === today ? " · Today" : ""}
                </h3>
              )}
              <ul className="divide-y divide-surface-0">
                {dayItems.map((item) => {
                  const Icon = KIND_ICONS[item.kind] ?? ListTodo;
                  const kind = CALENDAR_KIND_LABELS[item.kind] ?? "Item";
                  // Everything listed is unfinished, so a past date means it's late.
                  const late = item.date < today && item.kind !== "income";
                  return (
                    <li key={item.key}>
                      <Link
                        to={item.href}
                        className="-mx-2 flex min-h-11 items-center gap-3 rounded-control px-2 py-2 hover:bg-surface-0"
                      >
                        <Icon aria-hidden="true" className="size-5 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-fg">{item.title}</span>
                          <span className={`block text-sm ${late ? "text-danger" : "text-muted"}`}>
                            {kind}
                            {late ? " · Overdue" : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
