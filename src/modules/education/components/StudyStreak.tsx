import { Check } from "lucide-react";
import { Link } from "react-router";
import { ProgressBar } from "../../../client/components/ProgressBar";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { ghostButton } from "../../../client/components/ui";
import {
  type StudyDay,
  type StudyStreak,
  streakState,
  streakSummary,
} from "../../../shared/streak";
import { formatMinutes } from "../../../shared/time";
import { useStudyStreak } from "../queries";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** Link for the panel's header, to where the daily minimum is set. */
export function StreakSettingsLink() {
  return (
    <Link to="/settings" className={ghostButton}>
      Change minimum
    </Link>
  );
}

/** Streak, today's minutes against the minimum, and the last four weeks. */
export function StudyStreakSummary() {
  const streak = useStudyStreak();
  if (streak.isPending) return <LoadingRows rows={3} />;
  if (streak.isError) {
    return <ErrorNote error={streak.error} onRetry={() => void streak.refetch()} />;
  }
  const data = streak.data;
  const state = streakState(data);
  const percent = Math.min(100, Math.floor((data.todayMinutes / data.minimum) * 100));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <p className="flex items-baseline gap-2">
          <span className="text-5xl font-bold tracking-tight text-fg tabular-nums">
            {data.current}
          </span>{" "}
          <span className="font-semibold text-muted">
            {data.current === 1 ? "day in a row" : "days in a row"}
          </span>
        </p>
        <p className="text-sm text-muted">
          Longest: {data.longest} {data.longest === 1 ? "day" : "days"}
        </p>
      </div>

      <div>
        <div className="flex items-center gap-3">
          <ProgressBar percent={percent} label="Study today" complete={state === "met"} />
          <span className="shrink-0 text-sm font-semibold text-fg tabular-nums">
            {formatMinutes(data.todayMinutes)} / {formatMinutes(data.minimum)}
          </span>
        </div>
        <p
          className={`mt-2 text-sm font-semibold ${
            state === "met" ? "text-ok" : state === "at_risk" ? "text-warn" : "text-muted"
          }`}
        >
          {streakSummary(data)}
        </p>
      </div>

      <StudyCalendar streak={data} />
    </div>
  );
}

function weeks(days: StudyDay[]): Array<Array<StudyDay | null>> {
  const rows: Array<Array<StudyDay | null>> = [];
  for (let start = 0; start < days.length; start += 7) {
    const row: Array<StudyDay | null> = days.slice(start, start + 7);
    while (row.length < 7) row.push(null);
    rows.push(row);
  }
  return rows;
}

/** The last four weeks, Monday first. Met days are filled and checked. */
function StudyCalendar({ streak }: { streak: StudyStreak }) {
  return (
    <div>
      <table className="w-full table-fixed border-separate border-spacing-1.5">
        <caption className="sr-only">
          Study minutes for the last four weeks. The minimum is {formatMinutes(streak.minimum)} a
          day.
        </caption>
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th key={day} scope="col" className="text-xs font-semibold text-faint">
                <span aria-hidden="true">{day.slice(0, 1)}</span>
                <span className="sr-only">{day}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks(streak.days).map((row) => (
            <tr key={row.find(Boolean)?.date}>
              {row.map((day, index) =>
                day ? (
                  <DayCell key={day.date} day={day} streak={streak} />
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: empty days after today have no date.
                  <td key={index} />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="grid size-4 place-items-center rounded bg-ok">
            <Check className="size-3 text-crust" strokeWidth={3} />
          </span>
          Minimum met
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-4 rounded bg-ok/25" />
          Some study
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-4 rounded bg-surface-0" />
          None
        </li>
      </ul>
    </div>
  );
}

function DayCell({ day, streak }: { day: StudyDay; streak: StudyStreak }) {
  const met = day.minutes >= streak.minimum;
  const isToday = day.date === streak.today;
  const description = `${longDate(day.date)}${isToday ? " (today)" : ""}: ${formatMinutes(day.minutes)}${
    met ? ", minimum met" : ""
  }`;
  const tone = met
    ? "bg-ok text-crust"
    : day.minutes > 0
      ? "bg-ok/25 text-fg"
      : "bg-surface-0 text-faint";
  return (
    <td className="p-0">
      <span
        title={description}
        className={`grid h-9 place-items-center rounded-control text-xs font-semibold tabular-nums ${tone} ${
          isToday ? "ring-2 ring-accent-text ring-offset-2 ring-offset-mantle" : ""
        }`}
      >
        <span aria-hidden="true">
          {met ? <Check className="size-4" strokeWidth={3} /> : Number(day.date.slice(8))}
        </span>
        <span className="sr-only">{description}</span>
      </span>
    </td>
  );
}
