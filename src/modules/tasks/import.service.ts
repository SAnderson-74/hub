import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "../../server/db/client";
import {
  readTasksDocument,
  type TasksImportInput,
  type TasksImportResult,
  tasksImportSchema,
} from "../../shared/tasksImport";
import { createGoal, createMilestone } from "../goals/goals.service";
import { goals } from "../goals/schema";
import { createProject } from "./projects.service";
import { projects, tasks } from "./schema";
import { createTask } from "./tasks.service";

/** Thrown to roll a preview's changes back, carrying what they would have been. */
class Preview extends Error {
  constructor(readonly result: TasksImportResult) {
    super("preview");
  }
}

/**
 * Adds a pasted hub-tasks/v1 document: its projects (found by name, ignoring case, or
 * made), its tasks with their subtasks, and its goals with their milestones, through
 * the same services as adding them by hand. A task is skipped when an open task with
 * the same title is already in its project (or the inbox), and a goal when an active
 * goal has its title, so pasting the same answer twice adds nothing. With `dryRun`,
 * everything is rolled back and the result says what would happen.
 */
export function importTasks(
  db: Db,
  input: TasksImportInput,
  actor: string,
  dryRun: boolean,
): TasksImportResult {
  const { document } = tasksImportSchema.parse(input);
  const read = readTasksDocument(document);
  try {
    return db.transaction((tx) => {
      const result: TasksImportResult = {
        projectsCreated: [],
        tasks: [],
        goals: [],
        created: { tasks: 0, subtasks: 0, goals: 0, milestones: 0 },
      };
      const known = new Map(
        tx
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(isNull(projects.archivedAt))
          .all()
          .map((project) => [project.name.toLowerCase(), project.id]),
      );
      const notesFor = new Map(
        read.projects.map((project) => [project.name.toLowerCase(), project.notes]),
      );
      const projectId = (name: string): number => {
        const key = name.toLowerCase();
        const found = known.get(key);
        if (found !== undefined) return found;
        const created = createProject(tx, { name, notes: notesFor.get(key) ?? "" }, actor);
        known.set(key, created.id);
        result.projectsCreated.push(name);
        return created.id;
      };
      // Projects listed on their own are made even without tasks.
      for (const project of read.projects) projectId(project.name);

      for (const task of read.tasks) {
        const project = task.project ? projectId(task.project) : null;
        const duplicate = tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              sql`lower(${tasks.title}) = lower(${task.title})`,
              project === null ? isNull(tasks.projectId) : eq(tasks.projectId, project),
              isNull(tasks.parentId),
              ne(tasks.status, "done"),
            ),
          )
          .get();
        result.tasks.push({
          title: task.title,
          project: task.project || null,
          dueDate: task.dueDate,
          subtasks: task.subtasks.length,
          outcome: duplicate ? "duplicate" : "create",
          notices: task.notices,
        });
        if (duplicate) continue;
        const parent = createTask(
          tx,
          {
            title: task.title,
            notes: task.notes,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
            projectId: project,
          },
          actor,
        );
        for (const subtask of task.subtasks) {
          createTask(tx, { title: subtask, parentId: parent.id }, actor);
        }
        result.created.tasks += 1;
        result.created.subtasks += task.subtasks.length;
      }

      for (const goal of read.goals) {
        const duplicate = tx
          .select({ id: goals.id })
          .from(goals)
          .where(and(sql`lower(${goals.title}) = lower(${goal.title})`, eq(goals.status, "active")))
          .get();
        result.goals.push({
          title: goal.title,
          targetDate: goal.targetDate,
          milestones: goal.milestones.length,
          outcome: duplicate ? "duplicate" : "create",
          notices: goal.notices,
        });
        if (duplicate) continue;
        const created = createGoal(
          tx,
          { title: goal.title, notes: goal.notes, targetDate: goal.targetDate },
          actor,
        );
        for (const milestone of goal.milestones) {
          createMilestone(tx, created.id, milestone, actor);
        }
        result.created.goals += 1;
        result.created.milestones += goal.milestones.length;
      }

      if (dryRun) throw new Preview(result);
      return result;
    });
  } catch (error) {
    if (error instanceof Preview) return error.result;
    throw error;
  }
}
