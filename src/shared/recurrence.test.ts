import { describe, expect, it } from "vitest";
import {
  addMonths,
  describeRecurrence,
  nextDueDate,
  nextInSeries,
  occurrencesBetween,
  type Recurrence,
  recurrenceSchema,
} from "./recurrence";

describe("recurrence", () => {
  it("describes rules", () => {
    expect(describeRecurrence({ frequency: "daily", interval: 1 })).toBe("Daily");
    expect(describeRecurrence({ frequency: "weekly", interval: 2 })).toBe("Every 2 weeks");
    expect(describeRecurrence({ frequency: "monthly", interval: 3 })).toBe("Every 3 months");
  });

  it("validates rules and defaults the interval to 1", () => {
    expect(recurrenceSchema.parse({ frequency: "weekly" })).toEqual({
      frequency: "weekly",
      interval: 1,
    });
    expect(recurrenceSchema.safeParse({ frequency: "yearly", interval: 1 }).success).toBe(false);
    expect(recurrenceSchema.safeParse({ frequency: "daily", interval: 0 }).success).toBe(false);
    expect(
      recurrenceSchema.safeParse({ frequency: "daily", interval: 1, monthDay: 3 }).success,
    ).toBe(false);
  });

  it("follows the schedule from the due date", () => {
    const today = "2030-03-13";
    expect(nextDueDate({ frequency: "daily", interval: 1 }, today, today)).toBe("2030-03-14");
    expect(nextDueDate({ frequency: "weekly", interval: 1 }, today, today)).toBe("2030-03-20");
    expect(nextDueDate({ frequency: "weekly", interval: 2 }, "2030-03-15", today)).toBe(
      "2030-03-29",
    ); // finished early: still on schedule
    expect(nextDueDate({ frequency: "monthly", interval: 1 }, today, today)).toBe("2030-04-13");
  });

  it("skips ahead past today when finished late", () => {
    const today = "2030-03-13";
    expect(nextDueDate({ frequency: "daily", interval: 1 }, "2030-03-01", today)).toBe(
      "2030-03-14",
    );
    // Weekly on Mondays, done on a Wednesday: the next Monday.
    expect(nextDueDate({ frequency: "weekly", interval: 1 }, "2030-03-04", today)).toBe(
      "2030-03-18",
    );
    expect(nextDueDate({ frequency: "weekly", interval: 1 }, "2030-03-06", today)).toBe(
      "2030-03-20",
    ); // exactly a week late: not today, the week after
    expect(nextDueDate({ frequency: "monthly", interval: 1 }, "2030-01-10", today)).toBe(
      "2030-04-10",
    );
  });

  it("keeps month-end dates without drifting", () => {
    expect(addMonths("2030-01-31", 1)).toBe("2030-02-28");
    expect(addMonths("2032-01-31", 1)).toBe("2032-02-29"); // leap year
    expect(addMonths("2030-12-15", 1)).toBe("2031-01-15");
    const rule = { frequency: "monthly" as const, interval: 1, monthDay: 31 };
    expect(nextDueDate(rule, "2030-02-28", "2030-02-28")).toBe("2030-03-31");
    expect(nextDueDate(rule, "2030-03-31", "2030-03-31")).toBe("2030-04-30");
  });
});

describe("set days and ends", () => {
  // 2030-03-13 is a Wednesday.
  const wednesday = "2030-03-13";

  it("validates which options go together", () => {
    const ok = (input: object) => recurrenceSchema.safeParse(input).success;
    expect(ok({ frequency: "weekly", weekdays: [5, 1, 1, 3] })).toBe(true);
    expect(
      recurrenceSchema.parse({ frequency: "weekly", weekdays: [5, 1, 1, 3] }).weekdays,
    ).toEqual([1, 3, 5]);
    expect(ok({ frequency: "weekly", weekdays: [] })).toBe(false);
    expect(ok({ frequency: "daily", weekdays: [1] })).toBe(false);
    expect(ok({ frequency: "monthly", monthWeek: 2, weekday: 2 })).toBe(true);
    expect(ok({ frequency: "monthly", monthWeek: 2 })).toBe(false);
    expect(ok({ frequency: "weekly", monthWeek: 2, weekday: 2 })).toBe(false);
    expect(ok({ frequency: "monthly", onLastDay: true })).toBe(true);
    expect(ok({ frequency: "monthly", onLastDay: true, monthWeek: -1, weekday: 5 })).toBe(false);
    expect(ok({ frequency: "daily", from: "completion" })).toBe(true);
    expect(ok({ frequency: "weekly", weekdays: [1], from: "completion" })).toBe(false);
    expect(ok({ frequency: "daily", until: "2030-12-31", left: 3 })).toBe(true);
    expect(ok({ frequency: "daily", until: "someday" })).toBe(false);
  });

  it("describes them in words", () => {
    expect(
      describeRecurrence({ frequency: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] }),
    ).toBe("Every weekday");
    expect(describeRecurrence({ frequency: "weekly", interval: 2, weekdays: [1, 4] })).toBe(
      "Every 2 weeks on Mon and Thu",
    );
    expect(describeRecurrence({ frequency: "weekly", interval: 1, weekdays: [1, 3, 5] })).toBe(
      "Weekly on Mon, Wed, and Fri",
    );
    expect(describeRecurrence({ frequency: "monthly", interval: 12 })).toBe("Yearly");
    expect(describeRecurrence({ frequency: "monthly", interval: 24 })).toBe("Every 2 years");
    expect(
      describeRecurrence({ frequency: "monthly", interval: 1, monthWeek: 2, weekday: 2 }),
    ).toBe("Monthly on the 2nd Tuesday");
    expect(
      describeRecurrence({ frequency: "monthly", interval: 12, monthWeek: 4, weekday: 4 }),
    ).toBe("Yearly on the 4th Thursday");
    expect(describeRecurrence({ frequency: "monthly", interval: 1, onLastDay: true })).toBe(
      "Monthly on the last day",
    );
    expect(
      describeRecurrence({ frequency: "daily", interval: 3, from: "completion", left: 2 }),
    ).toBe("Every 3 days after it's done, 2 more");
    expect(describeRecurrence({ frequency: "weekly", interval: 1, until: "2030-06-30" })).toBe(
      "Weekly, until Jun 30, 2030",
    );
    expect(describeRecurrence({ frequency: "daily", interval: 1, left: 0 })).toBe(
      "Daily, last one",
    );
  });

  it("finds the next chosen weekday, every week or every other week", () => {
    const monWedFri = { frequency: "weekly" as const, interval: 1, weekdays: [1, 3, 5] };
    expect(nextDueDate(monWedFri, wednesday, wednesday)).toBe("2030-03-15"); // Friday
    expect(nextDueDate(monWedFri, "2030-03-15", "2030-03-15")).toBe("2030-03-18"); // Monday
    // Finished late on Thursday: Friday, not every day it missed.
    expect(nextDueDate(monWedFri, "2030-03-04", "2030-03-14")).toBe("2030-03-15");
    const everyOther = { frequency: "weekly" as const, interval: 2, weekdays: [2, 4] };
    // Due Thursday the 14th; the next Tuesday is in an off week, so two weeks on.
    expect(nextDueDate(everyOther, "2030-03-14", "2030-03-14")).toBe("2030-03-26");
    expect(nextDueDate(everyOther, "2030-03-26", "2030-03-26")).toBe("2030-03-28");
  });

  it("finds the nth or last weekday of the month, and the last day", () => {
    const secondTuesday: Recurrence = {
      frequency: "monthly",
      interval: 1,
      monthWeek: 2,
      weekday: 2,
    };
    expect(nextDueDate(secondTuesday, "2030-03-12", "2030-03-12")).toBe("2030-04-09");
    // Anchored mid-month before this month's second Tuesday: still this month.
    expect(nextDueDate(secondTuesday, "2030-03-01", "2030-03-01")).toBe("2030-03-12");
    const lastFriday: Recurrence = { frequency: "monthly", interval: 1, monthWeek: -1, weekday: 5 };
    expect(nextDueDate(lastFriday, "2030-03-29", "2030-03-29")).toBe("2030-04-26");
    const lastDay = { frequency: "monthly" as const, interval: 1, onLastDay: true as const };
    expect(nextDueDate(lastDay, "2030-01-31", "2030-01-31")).toBe("2030-02-28");
    expect(nextDueDate(lastDay, "2030-02-28", "2030-02-28")).toBe("2030-03-31");
    // Thanksgiving-style: the 4th Thursday of November, yearly.
    const yearly: Recurrence = { frequency: "monthly", interval: 12, monthWeek: 4, weekday: 4 };
    expect(nextDueDate(yearly, "2030-11-28", "2030-11-28")).toBe("2031-11-27");
  });

  it("counts from completion when asked", () => {
    const rule = { frequency: "daily" as const, interval: 10, from: "completion" as const };
    // Due the 1st, done the 13th: ten days from the 13th.
    expect(nextDueDate(rule, "2030-03-01", wednesday)).toBe("2030-03-23");
    const monthly = { frequency: "monthly" as const, interval: 3, from: "completion" as const };
    expect(nextDueDate({ ...monthly, monthDay: 1 }, "2030-01-01", wednesday)).toBe("2030-06-13");
  });

  it("hands the rule on, counting down, and stops at the end", () => {
    const counted = { frequency: "weekly" as const, interval: 1, left: 1 };
    const next = nextInSeries(counted, wednesday, wednesday);
    expect(next).toEqual({ dueDate: "2030-03-20", rule: { ...counted, left: 0 } });
    expect(next && nextInSeries(next.rule, next.dueDate, next.dueDate)).toBeNull();

    const until = { frequency: "weekly" as const, interval: 1, until: "2030-03-25" };
    expect(nextInSeries(until, wednesday, wednesday)?.dueDate).toBe("2030-03-20");
    expect(nextInSeries(until, "2030-03-20", "2030-03-20")).toBeNull();

    // Monthly rules keep their day, so the 31st comes back after a short month.
    expect(nextInSeries({ frequency: "monthly", interval: 1 }, "2030-01-31", "2030-01-31")).toEqual(
      { dueDate: "2030-02-28", rule: { frequency: "monthly", interval: 1, monthDay: 31 } },
    );
  });

  it("lists the dates in a range", () => {
    const rule = { frequency: "weekly" as const, interval: 1, weekdays: [2, 4] };
    expect(occurrencesBetween(rule, "2030-03-01", "2030-03-10", "2030-03-21")).toEqual([
      "2030-03-12",
      "2030-03-14",
      "2030-03-19",
      "2030-03-21",
    ]);
    // Nothing before the anchor, even in the anchor's own week or month.
    expect(occurrencesBetween(rule, "2030-03-13", "2030-03-11", "2030-03-15")).toEqual([
      "2030-03-14",
    ]);
    expect(
      occurrencesBetween(
        { frequency: "monthly", interval: 1, monthWeek: 2, weekday: 2 },
        "2030-03-20",
        "2030-03-01",
        "2030-04-30",
      ),
    ).toEqual(["2030-04-09"]);
    // The anchor itself counts when it's in range.
    expect(
      occurrencesBetween(
        { frequency: "monthly", interval: 1 },
        "2030-01-15",
        "2030-01-01",
        "2030-03-31",
      ),
    ).toEqual(["2030-01-15", "2030-02-15", "2030-03-15"]);
    expect(
      occurrencesBetween(
        { frequency: "daily", interval: 1, until: "2030-01-03" },
        "2030-01-01",
        "2030-01-01",
        "2030-01-31",
      ),
    ).toEqual(["2030-01-01", "2030-01-02", "2030-01-03"]);
  });
});
