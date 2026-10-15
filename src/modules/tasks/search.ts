import { desc, eq, sql } from "drizzle-orm";
import { containsWords, startsWithFirst } from "../../server/db/like";
import { PROJECT_KIND_LABELS, TASK_STATUS_LABELS } from "../../shared/tasks";
import type { Searcher } from "../core/search.service";
import { projects, tasks } from "./schema";

export const taskSearchers: Searcher[] = [
  {
    kind: "task",
    label: "Tasks",
    module: "tasks",
    // Open tasks before finished ones; a title that starts with the search before the rest.
    search: (db, { words, limit }) =>
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          dueDate: tasks.dueDate,
          project: projects.name,
        })
        .from(tasks)
        .leftJoin(projects, eq(projects.id, tasks.projectId))
        .where(containsWords([tasks.title, tasks.notes], words))
        .orderBy(
          sql`case when ${tasks.status} = 'done' then 1 else 0 end`,
          startsWithFirst(tasks.title, words[0] ?? ""),
          desc(tasks.updatedAt),
          desc(tasks.id),
        )
        .limit(limit)
        .all()
        .map((row) => ({
          id: row.id,
          title: row.title,
          detail: `${row.project ?? "Inbox"} · ${TASK_STATUS_LABELS[row.status]}`,
          date: row.status === "done" ? null : row.dueDate,
          amountCents: null,
          href: `/tasks?task=${row.id}`,
        })),
  },
  {
    kind: "project",
    label: "Projects",
    module: "tasks",
    search: (db, { words, limit }) =>
      db
        .select({
          id: projects.id,
          name: projects.name,
          kind: projects.kind,
          archivedAt: projects.archivedAt,
        })
        .from(projects)
        .where(containsWords([projects.name, projects.notes], words))
        .orderBy(
          sql`case when ${projects.archivedAt} is null then 0 else 1 end`,
          startsWithFirst(projects.name, words[0] ?? ""),
          projects.sortOrder,
        )
        .limit(limit)
        .all()
        .map((row) => ({
          id: row.id,
          title: row.name,
          detail: [PROJECT_KIND_LABELS[row.kind], row.archivedAt ? "Archived" : ""]
            .filter(Boolean)
            .join(" · "),
          date: null,
          amountCents: null,
          href: `/tasks?project=${row.id}`,
        })),
  },
];
