import {
  ClipboardPaste,
  FolderPlus,
  LayoutTemplate,
  List,
  Moon,
  Pencil,
  Plus,
  SquareKanban,
  Sunrise,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "../../../client/components/PageHeader";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  iconButton,
  inputClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { useCommand } from "../../../client/lib/useCommand";
import { useNow } from "../../../client/lib/useNow";
import { parseQuickAdd, type QuickAddChip } from "../../../shared/quickAdd";
import { describeRecurrence } from "../../../shared/recurrence";
import { SMART_LIST_LABELS, SMART_LISTS, type SmartList } from "../../../shared/smartLists";
import { type DayPlanMode, DayPlanSheet } from "../components/DayPlanSheet";
import { MoveSheet } from "../components/MoveSheet";
import { PasteTasksSheet } from "../components/PasteTasksSheet";
import { ProjectSheet } from "../components/ProjectSheet";
import { SmartTaskList } from "../components/SmartList";
import { TaskBoard, type TaskMove } from "../components/TaskBoard";
import { TaskList } from "../components/TaskList";
import { TaskSheet } from "../components/TaskSheet";
import { TemplatesSheet } from "../components/TemplatesSheet";
import { formatShortDate, localDate } from "../dates";
import { seriesContinues } from "../draft";
import {
  type ProjectFilter,
  type ProjectItem,
  type TaskItem,
  useCreateTask,
  useProjects,
  useTaskSet,
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

/** A smart list from the address, or "all" for the usual list and board. */
function parseList(value: string | null): SmartList | "all" {
  return SMART_LISTS.find((list) => list === value) ?? "all";
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
  const urlList = parseList(params.get("list"));
  const [list, setList] = useState(urlList);
  useEffect(() => setList(urlList), [urlList]);
  const selectList = (value: SmartList | "all") => {
    setList(value);
    setParam({ list: value === "all" ? null : value });
  };

  // A deleted or unknown project falls back to everything.
  const project: ProjectFilter =
    typeof requested === "number" &&
    projects.data &&
    !projectList.some((item) => item.id === requested)
      ? "all"
      : requested;
  const openTaskId = Number(params.get("task")) || null;

  const tasks = useTaskSet(project);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const today = localDate(useNow());

  const [title, setTitle] = useState("");
  // Chips turned back into plain words, by the words as typed.
  const [keep, setKeep] = useState<string[]>([]);
  const titleInput = useRef<HTMLInputElement>(null);
  // "Add a task" from the command menu, with the words typed there when it has them.
  useCommand("add-task", () => {
    const text = params.get("text");
    if (text) {
      setTitle(text.slice(0, 300));
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("text");
          return next;
        },
        { replace: true },
      );
    }
    titleInput.current?.focus();
  });
  const [announcement, setAnnouncement] = useState("");
  const [moving, setMoving] = useState<TaskItem | null>(null);
  const [projectSheet, setProjectSheet] = useState<"new" | ProjectItem | null>(null);
  const [pastingTasks, setPastingTasks] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [dayPlan, setDayPlan] = useState<DayPlanMode>(null);
  useCommand("templates", () => setTemplatesOpen(true));
  useCommand("plan", () => setDayPlan("plan"));
  useCommand("shutdown", () => setDayPlan("shutdown"));

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
  const taskList = tasks.tasks ?? [];
  const { doneTotal, hasMoreDone, loadingMoreDone, loadMoreDone } = tasks;
  const donePaging = { doneTotal, hasMoreDone, loadingMoreDone, loadMoreDone };
  const openCount = taskList.filter((task) => task.status !== "done").length;
  const doingCount = taskList.filter((task) => task.status === "doing").length;

  // Completing a repeating task adds the next one; say so for screen readers too.
  const announceRepeat = (task: TaskItem, status: TaskItem["status"]) => {
    if (task.recurrence && task.status !== "done" && status === "done") {
      setAnnouncement(
        seriesContinues(task.recurrence, task.dueDate, today)
          ? `Done. The next “${task.title}” is in To do.`
          : `Done. That was the last “${task.title}”.`,
      );
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

  // Dates, repeats, priority, tags, and @project are read as they're typed.
  const quick = parseQuickAdd(title, { today, projects: projectList, keep });
  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!quick.title) return;
    const typed = title;
    const kept = keep;
    // Clear now so the next task can be typed while this one saves.
    setTitle("");
    setKeep([]);
    createTask.mutate(
      {
        title: quick.title,
        projectId: quick.projectId ?? (typeof project === "number" ? project : null),
        dueDate: quick.dueDate,
        tags: quick.tags,
        recurrence: quick.recurrence,
        estimateMinutes: quick.estimateMinutes,
        ...(quick.priority === null ? {} : { priority: quick.priority }),
      },
      {
        onSuccess: (task) => setAnnouncement(`Task added: ${task.title}`),
        onError: () => {
          setTitle((current) => current || typed);
          setKeep((current) => (current.length > 0 ? current : kept));
        },
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
          tasks.tasks
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
          <button
            type="button"
            className={iconButton}
            aria-label="Templates"
            onClick={() => setTemplatesOpen(true)}
          >
            <LayoutTemplate aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label="Paste tasks from Claude"
            onClick={() => setPastingTasks(true)}
          >
            <ClipboardPaste aria-hidden="true" className="size-5" />
          </button>
        </div>

        {list === "all" ? (
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
        ) : null}

        {/* Many choices for a phone's width; the row scrolls sideways there. */}
        <fieldset className="flex w-full min-w-0 max-w-full overflow-x-auto rounded-full bg-mantle p-1 ring-1 ring-surface-0/60 sm:w-fit">
          <legend className="sr-only">Show</legend>
          {(["all", ...SMART_LISTS] as const).map((value) => (
            <label key={value} className="relative shrink-0">
              <input
                type="radio"
                name="task-list"
                value={value}
                checked={list === value}
                onChange={() => selectList(value)}
                className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
              />
              <span className="pointer-events-none flex h-10 items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap text-muted peer-checked:bg-surface-0 peer-checked:text-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text sm:px-4">
                {value === "all" ? "All" : SMART_LIST_LABELS[value]}
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      <form onSubmit={onAdd} className="mb-2 flex gap-2">
        <label htmlFor="new-task" className="sr-only">
          New task
        </label>
        <input
          ref={titleInput}
          id="new-task"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (!event.target.value.trim()) setKeep([]);
          }}
          aria-describedby="new-task-hint"
          placeholder={
            typeof project === "number"
              ? `Add a task to ${projectLabel(project, projectList)}`
              : "Add a task to the inbox"
          }
          maxLength={300}
          enterKeyHint="done"
          className={inputClass}
        />
        <button
          type="submit"
          className={primaryButton}
          disabled={!quick.title || createTask.isPending}
        >
          <Plus aria-hidden="true" className="size-5" />
          <span className="max-sm:sr-only">Add task</span>
        </button>
      </form>
      <QuickAddChips
        chips={quick.chips}
        title={quick.title}
        typed={title.trim().length > 0}
        today={today}
        repeat={quick.recurrence ? describeRecurrence(quick.recurrence) : null}
        onKeep={(chip) => setKeep((current) => [...current, chip.text])}
      />

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

      {tasks.error ? (
        <ErrorNote error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : tasks.isPending ? (
        <LoadingRows rows={4} />
      ) : list !== "all" ? (
        <>
          {list === "today" ? (
            <div className="mb-4 flex flex-wrap gap-2">
              <button type="button" className={secondaryButton} onClick={() => setDayPlan("plan")}>
                <Sunrise aria-hidden="true" className="size-4" />
                Plan the day
              </button>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setDayPlan("shutdown")}
              >
                <Moon aria-hidden="true" className="size-4" />
                Shut down
              </button>
            </div>
          ) : null}
          <SmartTaskList
            {...donePaging}
            list={list}
            tasks={taskList}
            today={today}
            projectNames={projectNames}
            onOpen={(task) => openTask(task.id)}
            onToggleDone={toggleDone}
          />
        </>
      ) : view === "board" ? (
        <TaskBoard
          {...donePaging}
          tasks={taskList}
          today={today}
          projectNames={projectNames}
          onOpen={(task) => openTask(task.id)}
          onMoveMenu={setMoving}
          onMove={move}
        />
      ) : (
        <TaskList
          {...donePaging}
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
      <PasteTasksSheet open={pastingTasks} onClose={() => setPastingTasks(false)} />
      <TemplatesSheet
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        projects={projectList}
        defaultProjectId={typeof project === "number" ? project : null}
        today={today}
      />
      <DayPlanSheet mode={dayPlan} today={today} onClose={() => setDayPlan(null)} />
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

const CHIP_PREFIX: Record<QuickAddChip["kind"], string> = {
  date: "Due",
  repeat: "Repeats",
  priority: "",
  tag: "Tag",
  project: "Project",
  estimate: "About",
};

/**
 * What the quick-add line will set, as chips. Each can be turned back into plain words
 * for the title, for a task that really is about "Friday" or "#1".
 */
function QuickAddChips({
  chips,
  title,
  typed,
  today,
  repeat,
  onKeep,
}: {
  chips: QuickAddChip[];
  title: string;
  typed: boolean;
  today: string;
  repeat: string | null;
  onKeep: (chip: QuickAddChip) => void;
}) {
  const shown = (chip: QuickAddChip) =>
    chip.kind === "date"
      ? formatShortDate(chip.label, today)
      : chip.kind === "repeat"
        ? (repeat ?? chip.label)
        : chip.label;
  return (
    <div className="mb-6 min-h-6">
      {chips.length > 0 ? (
        <ul aria-label="Read from the task" className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <li
              key={`${chip.kind}-${chip.text}`}
              className="flex items-center rounded-full bg-surface-0 pl-3 text-sm text-fg"
            >
              <span>
                {CHIP_PREFIX[chip.kind] ? (
                  <span className="text-muted">{CHIP_PREFIX[chip.kind]} </span>
                ) : null}
                {shown(chip)}
              </span>
              <button
                type="button"
                onClick={() => onKeep(chip)}
                aria-label={`Keep “${chip.text}” in the title`}
                className="grid size-11 place-items-center rounded-full text-muted hover:text-fg"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p id="new-task-hint" className="mt-1 text-sm text-muted">
        {chips.length > 0
          ? title
            ? `Adds “${title}”.`
            : "Add a few words for the title."
          : typed
            ? "Dates like “tomorrow” or “next Fri”, “every week”, “!high”, “#tag”, and “@project” are read as you type."
            : ""}
      </p>
    </div>
  );
}
