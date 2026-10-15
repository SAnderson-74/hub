import { describe, expect, it } from "vitest";
import {
  draftChanges,
  draftRule,
  monthlyChoices,
  parseInterval,
  parseTags,
  repeatProblem,
  seriesContinues,
  toDraft,
} from "./draft";
import type { TaskDetail } from "./queries";

const task: TaskDetail = {
  id: 1,
  projectId: 2,
  parentId: null,
  title: "Paint the fence",
  notes: "",
  status: "todo",
  priority: 0,
  dueDate: null,
  startDate: null,
  someday: false,
  evening: false,
  estimateMinutes: null,
  waitingOn: [],
  sortOrder: 1,
  completedAt: null,
  recurrence: null,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
  tags: [{ id: 1, name: "outdoors" }],
  subtaskCount: 0,
  subtasksDone: 0,
  subtasks: [],
};

describe("task form", () => {
  it("parses comma-separated tags", () => {
    expect(parseTags(" outdoors, ,weekend ,")).toEqual(["outdoors", "weekend"]);
  });

  it("sends nothing when nothing changed", () => {
    expect(draftChanges(task, toDraft(task))).toEqual({});
    // Whitespace around the title or tags isn't a change.
    expect(
      draftChanges(task, { ...toDraft(task), title: " Paint the fence ", tags: "outdoors ," }),
    ).toEqual({});
  });

  it("sends only the changed fields, in API form", () => {
    const draft = {
      ...toDraft(task),
      title: "Paint the gate",
      dueDate: "2030-02-01",
      projectId: "",
      priority: 3 as const,
      tags: "outdoors, weekend",
    };
    expect(draftChanges(task, draft)).toEqual({
      title: "Paint the gate",
      dueDate: "2030-02-01",
      projectId: null,
      priority: 3,
      tags: ["outdoors", "weekend"],
    });
    const cleared = draftChanges({ ...task, dueDate: "2030-02-01" }, toDraft(task));
    expect(cleared).toEqual({ dueDate: null });
  });

  it("turns the repeat fields into a rule, or null to stop repeating", () => {
    const start = toDraft(task);
    expect(start).toMatchObject({ repeat: "", interval: "1" });
    expect(draftChanges(task, { ...start, repeat: "weekly", interval: "2" })).toEqual({
      recurrence: { frequency: "weekly", interval: 2 },
    });
    const repeating = { ...task, recurrence: { frequency: "weekly" as const, interval: 2 } };
    expect(draftChanges(repeating, toDraft(repeating))).toEqual({});
    expect(draftChanges(repeating, { ...toDraft(repeating), repeat: "" })).toEqual({
      recurrence: null,
    });
    // An interval that isn't valid yet isn't sent.
    expect(draftChanges(repeating, { ...toDraft(repeating), interval: "" })).toEqual({});
    expect([
      parseInterval("3"),
      parseInterval("0"),
      parseInterval("100"),
      parseInterval("2.5"),
    ]).toEqual([3, null, null, null]);
  });
});

describe("repeat fields", () => {
  // 2030-03-12 is the 2nd Tuesday of March 2030.
  const due = { ...task, dueDate: "2030-03-12" };
  const today = "2030-03-01";
  const draft = toDraft(due);

  it("make weekly rules on chosen days", () => {
    expect(draftRule({ ...draft, repeat: "weekly", weekdays: [5, 1] }, today)).toEqual({
      frequency: "weekly",
      interval: 1,
      weekdays: [1, 5],
    });
    // No days picked: plain weekly, on the due date's day.
    expect(draftRule({ ...draft, repeat: "weekly" }, today)).toEqual({
      frequency: "weekly",
      interval: 1,
    });
  });

  it("make yearly rules as every 12 months, and read them back as yearly", () => {
    const rule = draftRule({ ...draft, repeat: "yearly", interval: "2" }, today);
    expect(rule).toEqual({ frequency: "monthly", interval: 24 });
    const saved = { ...due, recurrence: { frequency: "monthly" as const, interval: 24 } };
    expect(toDraft(saved)).toMatchObject({ repeat: "yearly", interval: "2" });
    expect(repeatProblem({ ...draft, repeat: "yearly", interval: "9" })).toBe(
      "Use a whole number from 1 to 8.",
    );
  });

  it("take the day of the month from the due date", () => {
    expect(monthlyChoices("2030-03-12")).toEqual(["day", "weekday", "lastDay"]);
    // The 29th is a 5th Friday, and the last one in March.
    expect(monthlyChoices("2030-03-29")).toEqual(["day", "lastWeekday", "lastDay"]);
    expect(draftRule({ ...draft, repeat: "monthly", monthlyOn: "weekday" }, today)).toEqual({
      frequency: "monthly",
      interval: 1,
      monthWeek: 2,
      weekday: 2,
    });
    expect(draftRule({ ...draft, repeat: "monthly", monthlyOn: "lastDay" }, today)).toEqual({
      frequency: "monthly",
      interval: 1,
      onLastDay: true,
    });
    // A choice the due date can't have falls back to the day of the month.
    expect(draftRule({ ...draft, repeat: "monthly", monthlyOn: "lastWeekday" }, today)).toEqual({
      frequency: "monthly",
      interval: 1,
    });
  });

  it("count from completion only when it's not on set days, and end as asked", () => {
    const fromDone = { ...draft, repeat: "daily" as const, interval: "3", fromCompletion: true };
    expect(draftRule(fromDone, today)).toMatchObject({ from: "completion" });
    expect(draftRule({ ...fromDone, repeat: "weekly", weekdays: [1] }, today)).not.toHaveProperty(
      "from",
    );
    expect(draftRule({ ...draft, repeat: "daily", ends: "count", left: "4" }, today)).toEqual({
      frequency: "daily",
      interval: 1,
      left: 4,
    });
    expect(
      draftRule({ ...draft, repeat: "daily", ends: "date", until: "2030-06-30" }, today),
    ).toMatchObject({ until: "2030-06-30" });
    expect(repeatProblem({ ...draft, repeat: "daily", ends: "date", until: "" })).toBe(
      "Pick the last date it can be due.",
    );
    expect(draftRule({ ...draft, repeat: "daily", ends: "count", left: "x" }, today)).toBe(
      undefined,
    );
  });

  it("send nothing for a saved rule left alone, and the whole rule when it changes", () => {
    const saved = {
      ...due,
      recurrence: { frequency: "monthly" as const, interval: 1, monthWeek: 2 as const, weekday: 2 },
    };
    expect(draftChanges(saved, toDraft(saved), today)).toEqual({});
    expect(draftChanges(saved, { ...toDraft(saved), ends: "count", left: "2" }, today)).toEqual({
      recurrence: { frequency: "monthly", interval: 1, monthWeek: 2, weekday: 2, left: 2 },
    });
  });

  it("say whether a series goes on", () => {
    expect(seriesContinues({ frequency: "daily", interval: 1 }, "2030-03-12", today)).toBe(true);
    expect(seriesContinues({ frequency: "daily", interval: 1, left: 0 }, "2030-03-12", today)).toBe(
      false,
    );
    expect(
      seriesContinues(
        { frequency: "daily", interval: 1, until: "2030-03-12" },
        "2030-03-12",
        today,
      ),
    ).toBe(false);
  });
});
