import { describe, expect, it } from "vitest";
import { draftChanges, parseTags, toDraft } from "./draft";
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
  sortOrder: 1,
  completedAt: null,
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
});
