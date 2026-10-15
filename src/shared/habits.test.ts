import { describe, expect, it } from "vitest";
import { type HabitSchedule, habitStats, scheduledOn, scheduleText } from "./habits";
import { addDays } from "./recurrence";

const today = "2030-03-13"; // a Wednesday
const days = (from: string, count: number, every = 1) =>
  Array.from({ length: count }, (_, index) => addDays(from, index * every));

describe("habit schedules", () => {
  it("read as words and pick their days", () => {
    expect(scheduleText({ kind: "daily" })).toBe("Every day");
    expect(scheduleText({ kind: "days", days: [0, 2, 4] })).toBe("Mon, Wed, Fri");
    expect(scheduleText({ kind: "days", days: [0, 1, 2, 3, 4] })).toBe("Weekdays");
    expect(scheduleText({ kind: "weekly", times: 3 })).toBe("3 times a week");
    expect(scheduleText({ kind: "weekly", times: 1 })).toBe("Once a week");
    expect(scheduledOn({ kind: "days", days: [0, 2, 4] }, today)).toBe(true);
    expect(scheduledOn({ kind: "days", days: [0, 2, 4] }, "2030-03-12")).toBe(false);
  });
});

describe("habit strength", () => {
  it("rises with check-ins and dips for a miss instead of resetting", () => {
    const daily = { kind: "daily" } as const;
    const start = addDays(today, -29);
    const every = new Set(days(start, 30));
    const full = habitStats(daily, start, every, today);
    expect(full.strength).toBeGreaterThan(75);
    expect(full.streak).toBe(30);
    expect(full.doneToday).toBe(true);

    // Yesterday missed: the streak starts over, the strength only dips.
    const missed = new Set([...every].filter((date) => date !== addDays(today, -1)));
    const after = habitStats(daily, start, missed, today);
    expect(after.streak).toBe(1);
    expect(after.strength).toBeLessThan(full.strength);
    expect(after.strength).toBeGreaterThan(full.strength - 10);
    expect(after.days.find((day) => day.date === addDays(today, -1))?.state).toBe("missed");
  });

  it("doesn't count today, or days before it started, against it", () => {
    const daily = { kind: "daily" } as const;
    const fresh = habitStats(daily, today, new Set(), today);
    expect(fresh).toMatchObject({ strength: 0, streak: 0, scheduledToday: true, doneToday: false });
    expect(fresh.days.at(-1)).toEqual({ date: today, state: "open" });
    expect(fresh.days.at(-2)?.state).toBe("off");
    // Not done yet today: yesterday's streak still stands.
    const start = addDays(today, -5);
    const yesterday = habitStats(daily, start, new Set(days(start, 5)), today);
    expect(yesterday.streak).toBe(5);
  });

  it("counts only a habit's own days", () => {
    const mwf: HabitSchedule = { kind: "days", days: [0, 2, 4] };
    // Mon Mar 4, Wed Mar 6, Fri Mar 8, Mon Mar 11, Wed Mar 13.
    const done = new Set(["2030-03-04", "2030-03-06", "2030-03-08", "2030-03-11", today]);
    const stats = habitStats(mwf, "2030-03-04", done, today);
    expect(stats.streak).toBe(5);
    expect(stats.days.find((day) => day.date === "2030-03-12")?.state).toBe("off");
  });

  it("judges a weekly habit by the week", () => {
    const thrice = { kind: "weekly", times: 3 } as const;
    // Last week three times, this week once so far.
    const done = new Set(["2030-03-04", "2030-03-06", "2030-03-09", "2030-03-11"]);
    const stats = habitStats(thrice, "2030-03-04", done, today);
    expect(stats).toMatchObject({
      streak: 1,
      streakUnit: "week",
      weekCount: 1,
      weekTarget: 3,
      scheduledToday: true,
    });
    expect(stats.strength).toBeGreaterThan(0);
    // This week isn't a miss until it's over.
    const lastWeekOnly = habitStats(thrice, "2030-03-04", done, today).strength;
    expect(lastWeekOnly).toBe(Math.round((1 - 0.5 ** (1 / 4)) * 100));
  });
});
