import { addDays } from "./recurrence";
import { formatMinutes } from "./time";

/** One calendar day of study, in the server's time zone. */
export type StudyDay = { date: string; minutes: number };

export type StudyStreak = {
  /** Minutes of study a day that count toward the streak (a setting). */
  minimum: number;
  today: string;
  todayMinutes: number;
  /** Days in a row meeting the minimum, through today, or through yesterday until today is met. */
  current: number;
  longest: number;
  /** Monday three weeks ago through today, oldest first, for the calendar. */
  days: StudyDay[];
};

export type StreakState = "met" | "at_risk" | "none";

/** 0 for Monday through 6 for Sunday. */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Streak counts from minutes studied per date. Today only extends the streak once
 * its minimum is met; until then the streak still stands from yesterday.
 */
export function countStreak(
  minutesByDate: ReadonlyMap<string, number>,
  today: string,
  minimum: number,
): { current: number; longest: number } {
  const met = (date: string) => (minutesByDate.get(date) ?? 0) >= minimum;

  let current = 0;
  let day = met(today) ? today : addDays(today, -1);
  while (met(day)) {
    current += 1;
    day = addDays(day, -1);
  }

  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  const dates = [...minutesByDate.keys()].filter((date) => date <= today && met(date)).sort();
  for (const date of dates) {
    run = previous !== null && addDays(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  return { current, longest: Math.max(longest, current) };
}

export function streakState(
  streak: Pick<StudyStreak, "minimum" | "todayMinutes" | "current">,
): StreakState {
  if (streak.todayMinutes >= streak.minimum) return "met";
  return streak.current > 0 ? "at_risk" : "none";
}

/** One sentence on what today still needs, shown next to the streak count. */
export function streakSummary(streak: StudyStreak): string {
  const left = formatMinutes(streak.minimum - streak.todayMinutes);
  switch (streakState(streak)) {
    case "met":
      return `Today counts: ${formatMinutes(streak.todayMinutes)} studied, ${formatMinutes(streak.minimum)} needed.`;
    case "at_risk":
      return `Study ${left} more today to keep the streak going.`;
    default:
      return streak.todayMinutes > 0
        ? `Study ${left} more today to start a streak.`
        : `Study ${formatMinutes(streak.minimum)} today to start a streak.`;
  }
}
