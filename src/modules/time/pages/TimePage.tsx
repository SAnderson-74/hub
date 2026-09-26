import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { iconButton, secondaryButton } from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { EntryList } from "../components/EntryList";
import { EntrySheet, type EntryTarget } from "../components/EntrySheet";
import { TimerPanel } from "../components/TimerPanel";
import { useEntries } from "../queries";
import { addDaysLocal, formatWeekRange, minutesByDay, startOfWeek, weekSummary } from "../week";

// The chart library is large, so it loads only when this page is opened.
const WeekChart = lazy(() =>
  import("../components/WeekChart").then((module) => ({ default: module.WeekChart })),
);

export function TimePage() {
  const now = useNow(30_000);
  const thisWeek = startOfWeek(now);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const entries = useEntries({ from: weekStart, to: addDaysLocal(weekStart, 7) });
  const [sheet, setSheet] = useState<EntryTarget>(null);
  const isThisWeek = weekStart.getTime() === thisWeek.getTime();
  const days = minutesByDay(entries.data ?? [], weekStart, now);

  return (
    <>
      <PageHeader title="Time" subtitle="Track what you spend time on and see how the week went." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        <TimerPanel className="lg:col-span-5" />

        <Panel
          title={isThisWeek ? "This week" : `Week of ${formatWeekRange(weekStart)}`}
          description={isThisWeek ? formatWeekRange(weekStart) : undefined}
          className="lg:col-span-7"
          action={
            <div className="-mt-2 -mr-2 flex shrink-0 items-center">
              <button
                type="button"
                className={iconButton}
                aria-label="Previous week"
                onClick={() => setWeekStart(addDaysLocal(weekStart, -7))}
              >
                <ChevronLeft aria-hidden="true" className="size-5" />
              </button>
              <button
                type="button"
                className={iconButton}
                aria-label="Next week"
                disabled={isThisWeek}
                onClick={() => setWeekStart(addDaysLocal(weekStart, 7))}
              >
                <ChevronRight aria-hidden="true" className="size-5" />
              </button>
            </div>
          }
        >
          {entries.isPending ? (
            <LoadingRows rows={3} />
          ) : entries.isError ? (
            <ErrorNote error={entries.error} onRetry={() => void entries.refetch()} />
          ) : (
            <Suspense fallback={<LoadingRows rows={3} />}>
              <WeekChart days={days} summary={weekSummary(days, isThisWeek)} />
            </Suspense>
          )}
          {isThisWeek ? null : (
            <button
              type="button"
              className="mt-4 h-11 rounded-full px-3 text-sm font-semibold text-accent-text hover:bg-surface-0"
              onClick={() => setWeekStart(thisWeek)}
            >
              Back to this week
            </button>
          )}
        </Panel>

        <Panel
          title="Entries"
          className="lg:col-span-12"
          action={
            <button type="button" className={secondaryButton} onClick={() => setSheet("new")}>
              <Plus aria-hidden="true" className="size-4" />
              Add time
            </button>
          }
        >
          {entries.isPending ? (
            <LoadingRows rows={3} />
          ) : entries.isError ? null : entries.data.length === 0 ? (
            <p className="text-muted">
              No time logged {isThisWeek ? "this week" : "that week"}. Start the timer or add time.
            </p>
          ) : (
            <EntryList entries={entries.data} now={now} onOpen={setSheet} />
          )}
        </Panel>
      </div>
      <EntrySheet target={sheet} onClose={() => setSheet(null)} />
    </>
  );
}
