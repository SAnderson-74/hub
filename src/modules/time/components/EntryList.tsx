import { formatMinutes } from "../../../shared/time";
import { localDate } from "../../tasks/dates";
import type { TimeEntry } from "../queries";
import { entryMinutes, formatClock } from "../week";
import { subjectLabel } from "./SubjectSelect";

/** Entries grouped by the day they started, newest first, each opening the edit sheet. */
export function EntryList({
  entries,
  now,
  onOpen,
}: {
  entries: TimeEntry[];
  now: Date;
  onOpen: (entry: TimeEntry) => void;
}) {
  const days = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const day = localDate(new Date(entry.startedAt));
    days.set(day, [...(days.get(day) ?? []), entry]);
  }

  return (
    <div className="space-y-6">
      {[...days].map(([day, dayEntries]) => {
        const total = dayEntries.reduce((sum, entry) => sum + entryMinutes(entry, now), 0);
        const heading = new Date(`${day}T12:00`).toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        return (
          <section key={day} aria-labelledby={`day-${day}`}>
            <h3
              id={`day-${day}`}
              className="mb-2 flex items-baseline justify-between gap-3 px-1 font-semibold text-fg"
            >
              {heading}
              <span className="text-sm text-muted tabular-nums">{formatMinutes(total)}</span>
            </h3>
            <ul className="space-y-2">
              {dayEntries.map((entry) => {
                // The subject names the entry; without one, the note does.
                const label = subjectLabel(entry.subject);
                const title = label ?? (entry.note || "Time");
                const detail = label ? entry.note : "";
                const range = `${formatClock(new Date(entry.startedAt))} – ${
                  entry.endedAt ? formatClock(new Date(entry.endedAt)) : "now"
                }`;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(entry)}
                      className="flex min-h-11 w-full items-start gap-3 rounded-tile bg-base/80 px-4 py-3 text-left ring-1 ring-surface-0/50 hover:ring-surface-1"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold break-words text-fg">{title}</span>
                        {detail ? (
                          <span className="mt-0.5 block text-sm break-words text-muted">
                            {detail}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block text-sm text-muted tabular-nums">
                          {range}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 font-semibold tabular-nums ${entry.endedAt ? "text-fg" : "text-accent-text"}`}
                      >
                        {entry.endedAt ? formatMinutes(entryMinutes(entry, now)) : "Running"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
