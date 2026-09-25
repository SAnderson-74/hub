import { describe, expect, it } from "vitest";
import { addMonths, describeRecurrence, nextDueDate, recurrenceSchema } from "./recurrence";

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
