import { describe, expect, it } from "vitest";
import { formatMinutes } from "../../shared/time";
import {
  draftRange,
  entryMinutes,
  formatElapsed,
  formatWeekRange,
  minutesByDay,
  startOfWeek,
  weekSummary,
} from "./week";

// Local times, so the tests hold in any time zone.
const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

describe("weeks", () => {
  it("start on Monday", () => {
    const monday = new Date(2030, 2, 11);
    expect(startOfWeek(new Date(2030, 2, 13, 15)).getTime()).toBe(monday.getTime()); // Wed
    expect(startOfWeek(new Date(2030, 2, 17, 23)).getTime()).toBe(monday.getTime()); // Sun
    expect(startOfWeek(monday).getTime()).toBe(monday.getTime());
  });

  it("add up minutes per day, counting a running timer until now", () => {
    const weekStart = new Date(2030, 2, 11);
    const now = new Date(2030, 2, 13, 10, 30);
    const days = minutesByDay(
      [
        { startedAt: at(2030, 3, 11, 9), endedAt: at(2030, 3, 11, 10), minutes: 60 },
        { startedAt: at(2030, 3, 11, 23, 30), endedAt: at(2030, 3, 12, 0, 30), minutes: 60 },
        { startedAt: at(2030, 3, 13, 10), endedAt: null, minutes: null },
        { startedAt: at(2030, 3, 10, 9), endedAt: at(2030, 3, 10, 10), minutes: 60 }, // last week
      ],
      weekStart,
      now,
    );
    expect(days).toEqual([120, 0, 30, 0, 0, 0, 0]);
    expect(
      entryMinutes({ startedAt: at(2030, 3, 13, 10), endedAt: null, minutes: null }, now),
    ).toBe(30);
  });

  it("summarize a week in one line", () => {
    expect(weekSummary([0, 0, 0, 0, 0, 0, 0], true)).toBe("No time logged this week.");
    expect(weekSummary([30, 180, 0, 0, 0, 0, 45], false)).toBe(
      "4 h 15 min that week, most on Tuesday (3 h).",
    );
  });

  it("format ranges and durations", () => {
    expect(formatWeekRange(new Date(2030, 2, 11))).toBe("Mar 11 – 17");
    expect(formatWeekRange(new Date(2030, 2, 25))).toBe("Mar 25 – 31");
    expect(formatWeekRange(new Date(2030, 3, 29))).toBe("Apr 29 – May 5");
    expect(formatWeekRange(new Date(2029, 11, 31))).toBe("Dec 31, 2029 – Jan 6, 2030");
    expect([formatMinutes(0), formatMinutes(45), formatMinutes(60), formatMinutes(125)]).toEqual([
      "0 min",
      "45 min",
      "1 h",
      "2 h 5 min",
    ]);
    const now = new Date(2030, 2, 13, 11, 23, 45);
    expect(formatElapsed(at(2030, 3, 13, 10), now)).toBe("1:23:45");
  });
});

describe("entry times", () => {
  it("turn a date and clock times into a range, crossing midnight when the end is earlier", () => {
    const same = draftRange({ date: "2030-03-13", start: "09:15", end: "10:45" });
    expect(same?.startedAt.getTime()).toBe(new Date(2030, 2, 13, 9, 15).getTime());
    expect(same?.endedAt?.getTime()).toBe(new Date(2030, 2, 13, 10, 45).getTime());
    expect(same?.nextDay).toBe(false);

    const late = draftRange({ date: "2030-03-13", start: "23:30", end: "00:15" });
    expect(late?.endedAt?.getTime()).toBe(new Date(2030, 2, 14, 0, 15).getTime());
    expect(late?.nextDay).toBe(true);

    expect(draftRange({ date: "2030-03-13", start: "09:00", end: "" })?.endedAt).toBeNull();
    expect(draftRange({ date: "", start: "09:00", end: "10:00" })).toBeNull();
  });
});
