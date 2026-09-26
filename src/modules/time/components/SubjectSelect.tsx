import { inputClass } from "../../../client/components/ui";
import { EARNED_STATUSES } from "../../../shared/education";
import { ENTITY_TYPE_NAMES, ENTITY_TYPES, type EntityRef } from "../../../shared/entities";
import { useTerms } from "../../education/queries";
import { useProjects, useTasks } from "../../tasks/queries";

/** "task:12" and back. "" is no subject. */
export function subjectValue(subject: EntityRef | null): string {
  return subject ? `${subject.type}:${subject.id}` : "";
}

export function parseSubject(value: string): EntityRef | null {
  const [type, id] = value.split(":");
  const entityType = ENTITY_TYPES.find((item) => item === type);
  const number = Number(id);
  return entityType && Number.isInteger(number) && number > 0
    ? { type: entityType, id: number }
    : null;
}

type Current = { type: EntityRef["type"]; id: number; label: string | null } | null;

/**
 * What time is for: nothing in particular, a course not yet passed, an open task, or
 * an active project. The
 * current subject stays listed even when it's done, archived, or deleted.
 */
export function SubjectSelect({
  id,
  value,
  current = null,
  onChange,
  describedBy,
}: {
  id: string;
  value: string;
  current?: Current;
  onChange: (value: string) => void;
  describedBy?: string;
}) {
  const projects = useProjects();
  const tasks = useTasks("all");
  const terms = useTerms();
  const activeProjects = (projects.data ?? []).filter((project) => !project.archived);
  const openTasks = (tasks.data ?? []).filter((task) => task.status !== "done");
  const openCourses = (terms.data ?? [])
    .flatMap((term) => term.courses)
    .filter((course) => !EARNED_STATUSES.includes(course.status));
  const listed = new Set([
    ...activeProjects.map((project) => `project:${project.id}`),
    ...openTasks.map((task) => `task:${task.id}`),
    ...openCourses.map((course) => `course:${course.id}`),
  ]);
  const extra = current && !listed.has(subjectValue(current)) ? current : null;

  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-describedby={describedBy}
      className={inputClass}
    >
      <option value="">Nothing in particular</option>
      {extra ? (
        <option value={subjectValue(extra)}>
          {extra.label ?? `Deleted ${ENTITY_TYPE_NAMES[extra.type]}`}
        </option>
      ) : null}
      {openCourses.length > 0 ? (
        <optgroup label="Courses">
          {openCourses.map((course) => (
            <option key={course.id} value={`course:${course.id}`}>
              {course.code ? `${course.code} ${course.title}` : course.title}
            </option>
          ))}
        </optgroup>
      ) : null}
      {openTasks.length > 0 ? (
        <optgroup label="Tasks">
          {openTasks.map((task) => (
            <option key={task.id} value={`task:${task.id}`}>
              {task.title}
            </option>
          ))}
        </optgroup>
      ) : null}
      {activeProjects.length > 0 ? (
        <optgroup label="Projects">
          {activeProjects.map((project) => (
            <option key={project.id} value={`project:${project.id}`}>
              {project.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}

/** How a subject reads in lists: its name, or that it was deleted. */
export function subjectLabel(subject: Current): string | null {
  if (!subject) return null;
  return subject.label ?? `Deleted ${ENTITY_TYPE_NAMES[subject.type]}`;
}
