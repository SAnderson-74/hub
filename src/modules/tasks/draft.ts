import type { TaskPriority, TaskStatus, TaskUpdate } from "../../shared/tasks";
import type { TaskDetail } from "./queries";

/** The task sheet's form values, as strings where inputs need them. */
export type Draft = {
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** "" for no due date. */
  dueDate: string;
  /** "" for the inbox, otherwise a project id. */
  projectId: string;
  /** Comma-separated. */
  tags: string;
};

export function toDraft(task: TaskDetail): Draft {
  return {
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ?? "",
    projectId: task.projectId === null ? "" : String(task.projectId),
    tags: task.tags.map((tag) => tag.name).join(", "),
  };
}

export function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** Only the fields that differ from the saved task. */
export function draftChanges(task: TaskDetail, draft: Draft): TaskUpdate {
  const saved = toDraft(task);
  const patch: TaskUpdate = {};
  if (draft.title.trim() !== saved.title) patch.title = draft.title.trim();
  if (draft.notes !== saved.notes) patch.notes = draft.notes;
  if (draft.status !== saved.status) patch.status = draft.status;
  if (draft.priority !== saved.priority) patch.priority = draft.priority;
  if (draft.dueDate !== saved.dueDate) patch.dueDate = draft.dueDate || null;
  if (draft.projectId !== saved.projectId) {
    patch.projectId = draft.projectId === "" ? null : Number(draft.projectId);
  }
  const tags = parseTags(draft.tags);
  if (tags.join("\n") !== parseTags(saved.tags).join("\n")) patch.tags = tags;
  return patch;
}
