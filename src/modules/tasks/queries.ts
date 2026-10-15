import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import { deleteLater } from "../../client/lib/undo";
import type { ProjectCreate, ProjectUpdate, TaskCreate, TaskUpdate } from "../../shared/tasks";
import type { TasksDocument } from "../../shared/tasksImport";
import type { TemplateFrom, TemplateUse } from "../../shared/templates";
import { mergeTasks } from "./ordering";

/** "all", "inbox" (no project), or a project id. */
export type ProjectFilter = "all" | "inbox" | number;

const projectQuery = (project: ProjectFilter) =>
  project === "all" ? {} : { projectId: String(project) };

/** Open tasks. Finished ones come separately, a page at a time (fetchDone). */
async function fetchTasks(project: ProjectFilter) {
  const res = await api.tasks.$get({
    query: { ...projectQuery(project), status: "backlog,todo,doing" },
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

/** A page of finished tasks, newest first. */
async function fetchDone(
  project: ProjectFilter,
  { before, since, limit }: { before?: string; since?: string; limit?: number } = {},
) {
  const res = await api.tasks.done.$get({
    query: {
      ...projectQuery(project),
      ...(before && { before }),
      ...(since && { since }),
      ...(limit && { limit: String(limit) }),
    },
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

async function fetchTask(id: number) {
  const res = await api.tasks[":id"].$get({ param: { id: String(id) } });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

async function fetchProjects() {
  const res = await api.projects.$get();
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export type TaskItem = Awaited<ReturnType<typeof fetchTasks>>[number];
type DonePage = Awaited<ReturnType<typeof fetchDone>>;
export type TaskDetail = Awaited<ReturnType<typeof fetchTask>>;
export type ProjectItem = Awaited<ReturnType<typeof fetchProjects>>[number];

const keys = {
  tasks: ["tasks"] as const,
  list: (project: ProjectFilter) => ["tasks", "list", project] as const,
  done: (project: ProjectFilter) => ["tasks", "done", project] as const,
  doneSince: (since: string) => ["tasks", "done-since", since] as const,
  detail: (id: number) => ["tasks", "detail", id] as const,
  projects: ["projects"] as const,
};

export function useTasks(project: ProjectFilter) {
  return useQuery({ queryKey: keys.list(project), queryFn: () => fetchTasks(project) });
}

/** Finished tasks, newest first, with a way to load the next page. */
export function useDoneTasks(project: ProjectFilter) {
  return useInfiniteQuery({
    queryKey: keys.done(project),
    queryFn: ({ pageParam }) => fetchDone(project, { before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next ?? undefined,
  });
}

/** Tasks finished at or after an instant, like the start of today. */
export function useTasksDoneSince(since: string) {
  return useQuery({
    queryKey: keys.doneSince(since),
    queryFn: () => fetchDone("all", { since, limit: 100 }),
  });
}

/**
 * A project's open tasks plus its finished tasks a page at a time, as one list for the
 * list and board views.
 */
export function useTaskSet(project: ProjectFilter) {
  const open = useTasks(project);
  const done = useDoneTasks(project);
  const finished = done.data?.pages.flatMap((page) => page.tasks) ?? [];
  return {
    tasks: open.data && done.data ? mergeTasks(open.data, finished) : undefined,
    isPending: open.isPending || done.isPending,
    error: open.error ?? done.error,
    refetch: () => Promise.all([open.refetch(), done.refetch()]),
    /** Every finished task, including pages not loaded yet. */
    doneTotal: done.data?.pages[0]?.total ?? 0,
    hasMoreDone: done.hasNextPage,
    loadingMoreDone: done.isFetchingNextPage,
    loadMoreDone: () => void done.fetchNextPage(),
  };
}

export function useTask(id: number | null) {
  return useQuery({
    queryKey: keys.detail(id ?? 0),
    queryFn: () => fetchTask(id ?? 0),
    enabled: id !== null,
  });
}

export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: fetchProjects });
}

/** Task lists and details, plus project counts, after any task change. */
function refreshTasks(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: keys.tasks });
  void queryClient.invalidateQueries({ queryKey: keys.projects });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (json: TaskCreate) => {
      const res = await api.tasks.$post({ json });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSettled: () => refreshTasks(queryClient),
  });
}

/** Fields that can be shown right away, before the server confirms the change. */
function applyPatch<T extends TaskItem>(task: T, patch: TaskUpdate): T {
  const { title, notes, status, priority, dueDate, sortOrder } = patch;
  return {
    ...task,
    ...(title !== undefined && { title }),
    ...(notes !== undefined && { notes }),
    ...(status !== undefined && { status }),
    ...(priority !== undefined && { priority }),
    ...(dueDate !== undefined && { dueDate }),
    ...(sortOrder !== undefined && { sortOrder }),
  };
}

const bySortOrder = (a: TaskItem, b: TaskItem) => a.sortOrder - b.sortOrder || a.id - b.id;

/** Updates a task, showing moves and status changes immediately and undoing them on failure. */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: TaskUpdate }) => {
      const res = await api.tasks[":id"].$patch({ param: { id: String(id) }, json: patch });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    // Synchronous, so the change shows on the very next render. Cancelling first stops
    // an in-flight refetch from overwriting it.
    onMutate: ({ id, patch }) => {
      void queryClient.cancelQueries({ queryKey: keys.tasks });
      const snapshot = queryClient.getQueriesData({ queryKey: keys.tasks });
      queryClient.setQueriesData<TaskItem[]>({ queryKey: ["tasks", "list"] }, (tasks) =>
        tasks?.map((task) => (task.id === id ? applyPatch(task, patch) : task)).sort(bySortOrder),
      );
      // Finished tasks keep their newest-first order; a reopened one moves to its status
      // group when the views merge the lists.
      const patchPage = (page: DonePage): DonePage => ({
        ...page,
        tasks: page.tasks.map((task) => (task.id === id ? applyPatch(task, patch) : task)),
      });
      queryClient.setQueriesData<InfiniteData<DonePage>>({ queryKey: ["tasks", "done"] }, (data) =>
        data ? { ...data, pages: data.pages.map(patchPage) } : data,
      );
      queryClient.setQueriesData<DonePage>({ queryKey: ["tasks", "done-since"] }, (page) =>
        page ? patchPage(page) : page,
      );
      queryClient.setQueriesData<TaskDetail>({ queryKey: ["tasks", "detail"] }, (task) => {
        if (!task) return task;
        if (task.id === id) return applyPatch(task, patch);
        if (!task.subtasks.some((subtask) => subtask.id === id)) return task;
        return {
          ...task,
          subtasks: task.subtasks.map((subtask) =>
            subtask.id === id ? applyPatch(subtask, patch) : subtask,
          ),
        };
      });
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (task) => queryClient.setQueryData(keys.detail(task.id), task),
    onSettled: () => refreshTasks(queryClient),
  });
}

/**
 * Deletes a task and its subtasks after a few seconds, with Undo until then. It leaves
 * the lists at once.
 */
export function useDeleteTaskLater() {
  const queryClient = useQueryClient();
  return (task: { id: number; title: string }) => {
    const send = (keepalive: boolean) =>
      api.tasks[":id"].$delete({ param: { id: String(task.id) } }, { init: { keepalive } });
    deleteLater(queryClient, {
      message: `Deleted ${task.title}`,
      restoredMessage: `Restored ${task.title}`,
      hide: { keys: [keys.tasks], remove: (data, key) => withoutTask(data, key, task.id) },
      commit: async () => {
        try {
          const res = await send(false);
          if (!res.ok) throw await toApiError(res);
          queryClient.removeQueries({ queryKey: keys.detail(task.id) });
        } finally {
          refreshTasks(queryClient);
        }
      },
      flush: () => void send(true),
    });
  };
}

/** A tasks query's data without the task (or, for a parent's detail, without the subtask). */
function withoutTask(data: unknown, key: QueryKey, id: number): unknown {
  const keep = (task: { id: number; parentId: number | null }) =>
    task.id !== id && task.parentId !== id;
  switch (key[1]) {
    case "list":
      return (data as TaskItem[]).filter(keep);
    case "done": {
      const pages = data as InfiniteData<DonePage>;
      return {
        ...pages,
        pages: pages.pages.map((page) => ({ ...page, tasks: page.tasks.filter(keep) })),
      };
    }
    case "done-since": {
      const page = data as DonePage;
      return { ...page, tasks: page.tasks.filter(keep) };
    }
    case "detail": {
      const task = data as TaskDetail;
      return task.subtasks.some((subtask) => subtask.id === id)
        ? { ...task, subtasks: task.subtasks.filter((subtask) => subtask.id !== id) }
        : task;
    }
    default:
      return data;
  }
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (json: ProjectCreate) => {
      const res = await api.projects.$post({ json });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: ProjectUpdate }) => {
      const res = await api.projects[":id"].$patch({ param: { id: String(id) }, json: patch });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.projects }),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.projects[":id"].$delete({ param: { id: String(id) } });
      if (!res.ok) throw await toApiError(res);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.projects }),
  });
}

/** Projects, tasks, and goals pasted from the Claude Project. A preview changes nothing. */
export function useImportTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ document, dryRun }: { document: TasksDocument; dryRun: boolean }) => {
      const res = await api.tasks.import.$post({
        query: dryRun ? { dryRun: "true" } : {},
        json: { document },
      });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSuccess: (_result, { dryRun }) => {
      // Tasks, projects, and goals all change.
      if (!dryRun) void queryClient.invalidateQueries();
    },
  });
}

// Templates

export type Template = Awaited<ReturnType<typeof fetchTemplates>>[number];

async function fetchTemplates() {
  const res = await api.templates.$get();
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

const templateKey = ["templates"] as const;

export function useTemplates(enabled = true) {
  return useQuery({ queryKey: templateKey, queryFn: fetchTemplates, enabled });
}

export function useSaveTemplateFrom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (json: TemplateFrom) => {
      const res = await api.templates.from.$post({ json });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: templateKey }),
  });
}

export function useRenameTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await api.templates[":id"].$patch({ param: { id: String(id) }, json: { name } });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: templateKey }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.templates[":id"].$delete({ param: { id: String(id) } });
      if (!res.ok) throw await toApiError(res);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: templateKey }),
  });
}

export function useUseTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...json }: TemplateUse & { id: number }) => {
      const res = await api.templates[":id"].use.$post({ param: { id: String(id) }, json });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSettled: () => refreshTasks(queryClient),
  });
}
