import { addDays, weekdayOf } from "../../shared/recurrence";

/** "2030-03" for the month a date is in. */
export const monthOf = (date: string) => date.slice(0, 7);

/** The month `offset` months from `month`. */
export function shiftMonth(month: string, offset: number): string {
  const [year = 0, number = 1] = month.split("-").map(Number);
  const index = year * 12 + (number - 1) + offset;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** "March 2030" */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

/**
 * The weeks a month grid shows, Monday first: from the Monday on or before the 1st
 * through the Sunday on or after the last day.
 */
export function monthGrid(month: string): { from: string; to: string; weeks: string[][] } {
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const from = addDays(first, -((weekdayOf(first) + 6) % 7));
  const to = addDays(last, (7 - weekdayOf(last)) % 7);
  const weeks: string[][] = [];
  for (let day = from; day <= to; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(day, index)));
  }
  return { from, to, weeks };
}
