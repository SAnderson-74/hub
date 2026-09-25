import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import {
  GOAL_TASK_RELATION,
  type GoalCreate,
  type GoalUpdate,
  type MilestoneCreate,
  type MilestoneUpdate,
} from "../../shared/goals";

async function fetchGoals() {
  const res = await api.goals.$get();
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

async function fetchGoal(id: number) {
  const res = await api.goals[":id"].$get({ param: { id: String(id) } });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export type GoalItem = Awaited<ReturnType<typeof fetchGoals>>[number];
export type GoalDetail = Awaited<ReturnType<typeof fetchGoal>>;

const keys = {
  all: ["goals"] as const,
  list: ["goals", "list"] as const,
  detail: (id: number) => ["goals", "detail", id] as const,
};

// Progress depends on tasks and milestones changed elsewhere, so refetch on every visit.
export function useGoals() {
  return useQuery({ queryKey: keys.list, queryFn: fetchGoals, staleTime: 0 });
}

export function useGoal(id: number | null) {
  return useQuery({
    queryKey: keys.detail(id ?? 0),
    queryFn: () => fetchGoal(id ?? 0),
    enabled: id !== null,
    staleTime: 0,
  });
}

function refresh(queryClient: QueryClient, goal?: GoalDetail) {
  if (goal) queryClient.setQueryData(keys.detail(goal.id), goal);
  void queryClient.invalidateQueries({ queryKey: keys.all });
}

function useGoalMutation<Input>(request: (input: Input) => Promise<GoalDetail | undefined>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (goal) => refresh(queryClient, goal),
    onError: () => refresh(queryClient),
  });
}

export function useCreateGoal() {
  return useGoalMutation(async (json: GoalCreate) => {
    const res = await api.goals.$post({ json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useUpdateGoal() {
  return useGoalMutation(async ({ id, patch }: { id: number; patch: GoalUpdate }) => {
    const res = await api.goals[":id"].$patch({ param: { id: String(id) }, json: patch });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.goals[":id"].$delete({ param: { id: String(id) } });
      if (!res.ok) throw await toApiError(res);
    },
    onSuccess: (_result, id) => queryClient.removeQueries({ queryKey: keys.detail(id) }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useAddMilestone() {
  return useGoalMutation(async ({ goalId, json }: { goalId: number; json: MilestoneCreate }) => {
    const res = await api.goals[":id"].milestones.$post({ param: { id: String(goalId) }, json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

type MilestoneRef = { goalId: number; milestoneId: number };
const milestoneParam = ({ goalId, milestoneId }: MilestoneRef) => ({
  id: String(goalId),
  milestoneId: String(milestoneId),
});

export function useUpdateMilestone() {
  return useGoalMutation(async (input: MilestoneRef & { patch: MilestoneUpdate }) => {
    const res = await api.goals[":id"].milestones[":milestoneId"].$patch({
      param: milestoneParam(input),
      json: input.patch,
    });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useDeleteMilestone() {
  return useGoalMutation(async (input: MilestoneRef) => {
    const res = await api.goals[":id"].milestones[":milestoneId"].$delete({
      param: milestoneParam(input),
    });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

/** Links a task to a goal, or removes a link by id. Both go through /api/links. */
export function useLinkTask() {
  return useGoalMutation(async ({ goalId, taskId }: { goalId: number; taskId: number }) => {
    const res = await api.links.$post({
      json: {
        from: { type: "task", id: taskId },
        to: { type: "goal", id: goalId },
        relation: GOAL_TASK_RELATION,
      },
    });
    if (!res.ok) throw await toApiError(res);
    return undefined;
  });
}

export function useUnlinkTask() {
  return useGoalMutation(async (linkId: number) => {
    const res = await api.links[":id"].$delete({ param: { id: String(linkId) } });
    if (!res.ok) throw await toApiError(res);
    return undefined;
  });
}
