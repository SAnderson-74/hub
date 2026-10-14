import { describe, expect, it } from "vitest";
import { inToday } from "../../shared/smartLists";
import { planTotals, todayPatch, tomorrowPatch } from "./plan";

const today = "2030-01-10";
const tomorrow = "2030-01-11";
const task = (fields: Partial<Parameters<typeof tomorrowPatch>[0]> = {}) => ({
  status: "todo" as const,
  dueDate: null,
  startDate: null,
  estimateMinutes: null,
  ...fields,
});

describe("planning the day", () => {
  it("adds up estimates and counts tasks without one", () => {
    expect(
      planTotals([task({ estimateMinutes: 30 }), task({ estimateMinutes: 90 }), task()]),
    ).toEqual({ minutes: 120, unestimated: 1 });
  });

  it("moves each kind of task out of today", () => {
    const cases = [
      task({ dueDate: "2030-01-02" }),
      task({ dueDate: today, startDate: "2030-01-08" }),
      task({ startDate: today, dueDate: "2030-01-20" }),
      task({ status: "doing" }),
    ];
    for (const item of cases) {
      const patch = tomorrowPatch(item, today, tomorrow);
      const moved = {
        ...item,
        dueDate: patch.dueDate ?? item.dueDate,
        startDate: patch.startDate ?? item.startDate,
        status: patch.status ?? item.status,
      };
      expect(inToday(moved, today), JSON.stringify(item)).toBe(false);
      expect(inToday(moved, tomorrow), JSON.stringify(item)).toBe(true);
      // Never starts after it's due.
      expect(!moved.startDate || !moved.dueDate || moved.startDate <= moved.dueDate).toBe(true);
    }
    expect(tomorrowPatch(task({ status: "doing" }), today, tomorrow)).toEqual({
      startDate: tomorrow,
      status: "todo",
    });
    // Out of Anytime too, until tomorrow.
    expect(tomorrowPatch(task({ dueDate: today }), today, tomorrow)).toEqual({
      startDate: tomorrow,
      dueDate: tomorrow,
    });
  });

  it("brings a task into today", () => {
    const item = {
      ...task({ dueDate: "2030-01-20" }),
      startDate: todayPatch(today).startDate ?? null,
    };
    expect(inToday(item, today)).toBe(true);
  });
});
