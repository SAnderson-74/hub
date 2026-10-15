import type { DayState } from "../../../shared/habits";

const TONE: Record<DayState, string> = {
  done: "bg-accent",
  missed: "bg-surface-1",
  open: "bg-surface-0 ring-1 ring-accent-text",
  off: "bg-base ring-1 ring-surface-0/70",
};

/**
 * Twelve weeks of a habit, one column a week, Monday at the top. The squares are for
 * the eye; the sentence beside them says the same for screen readers.
 */
export function HeatMap({
  days,
  label,
}: {
  days: ReadonlyArray<{ date: string; state: DayState }>;
  label: string;
}) {
  const weeks: Array<typeof days> = [];
  for (let start = 0; start < days.length; start += 7) weeks.push(days.slice(start, start + 7));
  const scheduled = days.filter((day) => day.state === "done" || day.state === "missed").length;
  const done = days.filter((day) => day.state === "done").length;
  return (
    <div className="min-w-0">
      <div aria-hidden="true" className="flex gap-[3px] overflow-hidden">
        {weeks.map((week) => (
          <div key={week[0]?.date} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <span key={day.date} className={`block size-3 rounded-[3px] ${TONE[day.state]}`} />
            ))}
          </div>
        ))}
      </div>
      <p className="sr-only">
        {label}: done on {done} {done === 1 ? "day" : "days"} of the last twelve weeks
        {scheduled > done ? `, missed ${scheduled - done}` : ""}.
      </p>
    </div>
  );
}
