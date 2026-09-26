import { daysBetween } from "../../shared/recurrence";

/** Where a date falls across a term, from 0 (its start) to 100 (its end), clamped. */
export function termPercent(date: string, start: string, end: string): number {
  const span = daysBetween(start, end);
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, (daysBetween(start, date) / span) * 100));
}

/**
 * A course's bar on the term's timeline, in percent. Without planned dates it spans
 * the whole term. A bar is never thinner than 2% so it stays visible.
 */
export function courseBar(
  course: { plannedStart: string | null; plannedEnd: string | null },
  term: { startDate: string; endDate: string },
): { left: number; width: number; planned: boolean } {
  const left = termPercent(course.plannedStart ?? term.startDate, term.startDate, term.endDate);
  const right = termPercent(course.plannedEnd ?? term.endDate, term.startDate, term.endDate);
  return {
    left,
    width: Math.max(2, right - left),
    planned: course.plannedStart !== null || course.plannedEnd !== null,
  };
}

/** The first of each month inside the term, for tick marks: "Feb", "Mar", ... */
export function monthTicks(
  start: string,
  end: string,
): Array<{ date: string; label: string; left: number }> {
  const ticks: Array<{ date: string; label: string; left: number }> = [];
  let [year = 1970, month = 1] = start.split("-").map(Number);
  // Start from the month after the start unless the term begins on the 1st.
  if (!start.endsWith("-01")) month += 1;
  for (;;) {
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const date = `${year}-${String(month).padStart(2, "0")}-01`;
    if (date > end) break;
    const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    ticks.push({ date, label, left: termPercent(date, start, end) });
    month += 1;
  }
  return ticks;
}

/** "3 credits", "1 credit", "1.5 credits". */
export function formatCredits(credits: number): string {
  return `${credits} ${credits === 1 ? "credit" : "credits"}`;
}

/** The term to show first: the one running today, else the next, else the latest. */
export function defaultTerm<T extends { id: number; startDate: string; endDate: string }>(
  terms: T[],
  today: string,
): T | undefined {
  return (
    terms.find((term) => term.startDate <= today && today <= term.endDate) ??
    terms.find((term) => term.startDate > today) ??
    terms.at(-1)
  );
}
