import { describe, expect, it } from "vitest";
import { countStreak, streakSummary, weekdayIndex } from "./streak";

const minutes = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe("countStreak", () => {
  it("counts days in a row through today once today is met", () => {
    const days = minutes({ "2030-01-08": 30, "2030-01-09": 45, "2030-01-10": 30 });
    expect(countStreak(days, "2030-01-10", 30)).toEqual({ current: 3, longest: 3 });
  });

  it("keeps yesterday's streak while today is still short", () => {
    const days = minutes({ "2030-01-08": 30, "2030-01-09": 45, "2030-01-10": 10 });
    expect(countStreak(days, "2030-01-10", 30)).toEqual({ current: 2, longest: 2 });
  });

  it("breaks on a missed day and remembers the longest run", () => {
    const days = minutes({
      "2029-12-30": 60,
      "2029-12-31": 60,
      "2030-01-01": 60,
      "2030-01-02": 29,
      "2030-01-03": 30,
    });
    expect(countStreak(days, "2030-01-05", 30)).toEqual({ current: 0, longest: 3 });
    expect(countStreak(days, "2030-01-03", 30)).toEqual({ current: 1, longest: 3 });
  });

  it("is empty without study", () => {
    expect(countStreak(new Map(), "2030-01-05", 30)).toEqual({ current: 0, longest: 0 });
  });
});

describe("streakSummary", () => {
  const base = { minimum: 30, today: "2030-01-10", longest: 4, days: [] };
  it("says what today still needs", () => {
    expect(streakSummary({ ...base, current: 3, todayMinutes: 45 })).toBe(
      "Today counts: 45 min studied, 30 min needed.",
    );
    expect(streakSummary({ ...base, current: 1, todayMinutes: 10 })).toBe(
      "Study 20 min more today to keep the streak going.",
    );
    expect(streakSummary({ ...base, current: 0, todayMinutes: 0 })).toBe(
      "Study 30 min today to start a streak.",
    );
    expect(streakSummary({ ...base, current: 0, todayMinutes: 25 })).toBe(
      "Study 5 min more today to start a streak.",
    );
  });
});

it("numbers weekdays from Monday", () => {
  expect(weekdayIndex("2030-01-07")).toBe(0);
  expect(weekdayIndex("2030-01-13")).toBe(6);
});
