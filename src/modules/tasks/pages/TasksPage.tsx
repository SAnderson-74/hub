import { FolderPlus, List, Pencil, Plus, SquareKanban } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "../../../client/components/PageHeader";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { iconButton, inputClass, primaryButton } from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { MoveSheet } from "../components/MoveSheet";
import { ProjectSheet } from "../components/ProjectSheet";
import { TaskBoard, type TaskMove } from "../components/TaskBoard";
import { TaskList } from "../components/TaskList";
import { TaskSheet } from "../components/TaskSheet";
import { localDate } from "../dates";
import {
  type ProjectFilter,
  type ProjectItem,
  type TaskItem,
  useCreateTask,
  useProjects,
  useTasks,
  useUpdateTask,
} from "../queries";

type View = "list" | "board";
const VIEW_KEY = "hub.tasks.view";

function storedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "board" ? "board" : "list";
  } catch {
    return "list";
  }
}

function rememberView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Private browsing; the choice still applies to this visit through the URL.
  }
}

function parseProject(value: string | null): ProjectFilter {
  if (value === "inbox") return "inbox";
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : "all";
}

function projectLabel(filter: ProjectFilter, projects: ProjectItem[]): string {
  if (filter === "all") return "all projects";
  if (filter === "inbox") return "the inbox";
  return projects.find((project) => project.id === filter)?.name ?? "this project";
}

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const projects = useProjects();
  const projectList = projects.data ?? [];

  // Controls keep their own state so they change on the tap; the URL follows (React
  // Router applies URL changes as a transition) and wins on back and forward.
  const urlProject = parseProject(params.get("project"));
  const [requested, setRequested] = useState(urlProject);
  useEffect(() => setRequested(urlProject), [urlProject]);
  const [view, setView] = useState(storedView);

  // A deleted or unknown project falls back to everything.
  const project: ProjectFilter =
    typeof requested === "number" &&
    projects.data &&
    !projectList.some((item) => item.id === requested)
      ? "all"
      : requested;
  const openTaskId = Number(params.get("task")) || null;

  const tasks = useTasks(project);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const today = localDate(useNow());

  const [title, setTitle] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [moving, setMoving] = useState<TaskItem | null>(null);
  const [projectSheet, setProjectSheet] = useState<"new" | ProjectItem | null>(null);

  const selectProject = (value: ProjectFilter) => {
    setRequested(value);
    setParam({ project: value === "all" ? null : String(value) });
  };

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true, state: location.state });
  };

  // Opening a task adds a history entry so the phone's back gesture closes the sheet.
  const openTask = (id: number) => {
    if (openTaskId === null) {
      const next = new URLSearchParams(params);
      next.set("task", String(id));
      navigate({ search: next.toString() }, { state: { sheet: true } });
    } else {
      setParam({ task: String(id) });
    }
  };
  const closeTask = () => {
    if ((location.state as { sheet?: boolean } | null)?.sheet) navigate(-1);
    else setParam({ task: null });
  };

  const selectedProject =
    typeof project === "number" ? projectList.find((item) => item.id === project) : undefined;
  const projectNames =
    project === "all" ? new Map(projectList.map((item) => [item.id, item.name])) : undefined;
  const taskList = tasks.data ?? [];
  const openCount = taskList.filter((task) => task.status !== "done").length;
  const doingCount = taskList.filter((task) => task.status === "doing").length;

  // Completing a repeating task adds the next one; say so for screen readers too.
  const announceRepeat = (task: TaskItem, status: TaskItem["status"]) => {
    if (task.recurrence && task.status !== "done" && status === "done") {
      setAnnouncement(`Done. The next “${task.title}” is in To do.`);
    }
  };

  const move = ({ task, status, sortOrder }: TaskMove) => {
    updateTask.mutate(
      { id: task.id, patch: { sortOrder, ...(status !== task.status && { status }) } },
      { onSuccess: () => announceRepeat(task, status) },
    );
  };

  // Failures show in the alert below, from the mutation's error state.
  const toggleDone = (task: TaskItem, done: boolean) =>
    updateTask
      .mutateAsync({ id: task.id, patch: { status: done ? "done" : "todo" } })
      .then(() => announceRepeat(task, done ? "done" : "todo"))
      .catch(() => undefined);

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    // Clear now so the next task can be typed while this one saves.
    setTitle("");
    createTask.mutate(
      { title: trimmed, projectId: typeof project === "number" ? project : null },
      {
        onSuccess: (task) => setAnnouncement(`Task added: ${task.title}`),
        onError: () => setTitle((current) => current || trimmed),
      },
    );
  };

  const active = projectList.filter((item) => !item.archived);
  const archived = projectList.filter((item) => item.archived);

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={
          tasks.data
            ? openCount === 0
              ? `Nothing open in ${projectLabel(project, projectList)}.`
              : `${openCount} open${doingCount > 0 ? `, ${doingCount} in progress` : ""} in ${projectLabel(project, projectList)}.`
            : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex w-full min-w-0 items-center gap-1 sm:w-auto sm:max-w-sm sm:flex-1">
          <label htmlFor="task-project" className="sr-only">
            Project
          </label>
          <select
            id="task-project"
            value={String(project)}
            onChange={(event) => selectProject(parseProject(event.target.value))}
            className={`${inputClass} min-w-0 font-semibold`}
          >
            <option value="all">All tasks</option>
            <option value="inbox">Inbox</option>
            {active.length > 0 ? (
              <optgroup label="Projects">
                {active.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {archived.length > 0 ? (
              <optgroup label="Archived">
                {archived.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          {selectedProject ? (
            <button
              type="button"
              className={iconButton}
              aria-label={`Edit project ${selectedProject.name}`}
              onClick={() => setProjectSheet(selectedProject)}
            >
              <Pencil aria-hidden="true" className="size-5" />
            </button>
          ) : null}
          <button
            type="button"
            className={iconButton}
            aria-label="New project"
            onClick={() => setProjectSheet("new")}
          >
            <FolderPlus aria-hidden="true" className="size-5" />
          </button>
        </div>

        <fieldset className="flex rounded-full bg-mantle p-1 ring-1 ring-surface-0/60">
          <legend className="sr-only">View</legend>
          {(
            [
              ["list", "List", List],
              ["board", "Board", SquareKanban],
            ] as const
          ).map(([value, label, Icon]) => (
            <label key={value} className="relative">
              <input
                type="radio"
                name="task-view"
                value={value}
                checked={view === value}
                onChange={() => {
                  setView(value);
                  rememberView(value);
                }}
                className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
              />
              <span className="pointer-events-none flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-muted peer-checked:bg-surface-0 peer-checked:text-fg">
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      <form onSubmit={onAdd} className="mb-6 flex gap-2">
        <label htmlFor="new-task" className="sr-only">
          New task
        </label>
        <input
          id="new-task"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={
            typeof project === "number"
              ? `Add a task to ${projectLabel(project, projectList)}`
              : "Add a task to the inbox"
          }
          maxLength={200}
          enterKeyHint="done"
          className={inputClass}
        />
        <button
          type="submit"
          className={primaryButton}
          disabled={!title.trim() || createTask.isPending}
        >
          <Plus aria-hidden="true" className="size-5" />
          <span className="max-sm:sr-only">Add task</span>
        </button>
      </form>

      <p role="status" className="sr-only">
        {announcement}
      </p>
      {createTask.isError || updateTask.isError ? (
        <p
          role="alert"
          className="mb-4 rounded-tile bg-mantle p-4 text-sm text-danger ring-1 ring-danger/40"
        >
          {(createTask.error ?? updateTask.error)?.message}
        </p>
      ) : null}

      {tasks.isPending ? (
        <LoadingRows rows={4} />
      ) : tasks.isError ? (
        <ErrorNote error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : view === "board" ? (
        <TaskBoard
          tasks={taskList}
          today={today}
          projectNames={projectNames}
          onOpen={(task) => openTask(task.id)}
          onMoveMenu={setMoving}
          onMove={move}
        />
      ) : (
        <TaskList
          tasks={taskList}
          today={today}
          projectNames={projectNames}
          onOpen={(task) => openTask(task.id)}
          onToggleDone={toggleDone}
        />
      )}

      <TaskSheet
        taskId={openTaskId}
        projects={projectList}
        onOpenTask={openTask}
        onClose={closeTask}
      />
      <MoveSheet task={moving} tasks={taskList} onMove={move} onClose={() => setMoving(null)} />
      <ProjectSheet
        target={projectSheet}
        onClose={() => setProjectSheet(null)}
        onCreated={(created) => {
          setProjectSheet(null);
          selectProject(created.id);
        }}
        onDeleted={() => {
          setProjectSheet(null);
          selectProject("all");
        }}
      />
    </>
  );
}
