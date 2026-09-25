import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type { ProjectCreate, ProjectUpdate, TaskCreate, TaskUpdate } from "../../shared/tasks";

/** "all", "inbox" (no project), or a project id. */
export type ProjectFilter = "all" | "inbox" | number;

async function fetchTasks(project: ProjectFilter) {
  const query = project === "all" ? {} : { projectId: String(project) };
  const res = await api.tasks.$get({ query });
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
export type TaskDetail = Awaited<ReturnType<typeof fetchTask>>;
export type ProjectItem = Awaited<ReturnType<typeof fetchProjects>>[number];

const keys = {
  tasks: ["tasks"] as const,
  list: (project: ProjectFilter) => ["tasks", "list", project] as const,
  detail: (id: number) => ["tasks", "detail", id] as const,
  projects: ["projects"] as const,
};

export function useTasks(project: ProjectFilter) {
  return useQuery({ queryKey: keys.list(project), queryFn: () => fetchTasks(project) });
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

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.tasks[":id"].$delete({ param: { id: String(id) } });
      if (!res.ok) throw await toApiError(res);
    },
    onSuccess: (_result, id) => queryClient.removeQueries({ queryKey: keys.detail(id) }),
    onSettled: () => refreshTasks(queryClient),
  });
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
