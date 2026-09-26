import { describe, expect, it } from "vitest";
import { nextMilestones, todaySummary, todaysTasks } from "./home";

const today = "2030-01-10";
const task = (id: number, fields: Partial<Parameters<typeof todaysTasks>[0][number]>) => ({
  id,
  status: "todo" as const,
  priority: 0,
  dueDate: null,
  completedAt: null,
  sortOrder: id,
  ...fields,
});

describe("todaysTasks", () => {
  it("lists overdue, then due today, then in progress, and what was finished today", () => {
    const tasks = [
      task(1, { dueDate: "2030-01-12" }),
      task(2, { dueDate: today }),
      task(3, { dueDate: today, priority: 3 }),
      task(4, { status: "doing" }),
      task(5, { dueDate: "2030-01-08" }),
      task(6, { status: "backlog" }),
      task(7, { status: "done", completedAt: new Date(2030, 0, 10, 9).toISOString() }),
      task(8, { status: "done", completedAt: new Date(2030, 0, 9, 9).toISOString() }),
      // Just ticked off: the server hasn't set its completion time yet.
      task(9, { status: "done", dueDate: today }),
    ];
    const { open, done } = todaysTasks(tasks, today);
    expect(open.map((item) => item.id)).toEqual([5, 3, 2, 4]);
    expect(done.map((item) => item.id)).toEqual([9, 7]);
  });
});

describe("todaySummary", () => {
  it("counts what's left, what's late, and what's done", () => {
    expect(todaySummary([{ dueDate: "2030-01-08" }, { dueDate: today }], 1, today)).toBe(
      "2 to do, 1 overdue. 1 done today.",
    );
    expect(todaySummary([{ dueDate: null }], 0, today)).toBe("1 to do.");
    expect(todaySummary([], 2, today)).toBe("Nothing left for today. 2 done today.");
  });
});

describe("nextMilestones", () => {
  it("takes open milestones of active goals, soonest first, undated last", () => {
    const goals = [
      {
        id: 1,
        title: "Run a 10K",
        status: "active",
        milestones: [
          { id: 11, title: "Run 5K", targetDate: "2030-02-01", done: false },
          { id: 12, title: "Run 3K", targetDate: "2030-01-15", done: true },
          { id: 13, title: "Buy shoes", targetDate: null, done: false },
        ],
      },
      {
        id: 2,
        title: "Old goal",
        status: "achieved",
        milestones: [{ id: 21, title: "Done long ago", targetDate: "2030-01-11", done: false }],
      },
      {
        id: 3,
        title: "Save for a bike",
        status: "active",
        milestones: [
          { id: 31, title: "Half way", targetDate: "2030-01-20", done: false },
          { id: 32, title: "Pick a model", targetDate: null, done: false },
        ],
      },
    ];
    expect(nextMilestones(goals, 5).map((item) => item.id)).toEqual([31, 11, 13, 32]);
    expect(nextMilestones(goals, 2)).toEqual([
      {
        id: 31,
        title: "Half way",
        targetDate: "2030-01-20",
        goalId: 3,
        goalTitle: "Save for a bike",
      },
      { id: 11, title: "Run 5K", targetDate: "2030-02-01", goalId: 1, goalTitle: "Run a 10K" },
    ]);
  });
});
