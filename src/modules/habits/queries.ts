import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type { HabitCreate, HabitUpdate } from "../../shared/habits";

const key = ["habits"] as const;

export type Habit = Awaited<ReturnType<typeof fetchHabits>>[number];

async function fetchHabits() {
  const res = await api.habits.$get();
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export function useHabits(enabled = true) {
  return useQuery({ queryKey: key, queryFn: fetchHabits, enabled });
}

function useHabitMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useCreateHabit() {
  return useHabitMutation(async (json: HabitCreate) => {
    const res = await api.habits.$post({ json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useUpdateHabit() {
  return useHabitMutation(async ({ id, patch }: { id: number; patch: HabitUpdate }) => {
    const res = await api.habits[":id"].$patch({ param: { id: String(id) }, json: patch });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useDeleteHabit() {
  return useHabitMutation(async (id: number) => {
    const res = await api.habits[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
  });
}

/** Checks a habit off for a day, or takes it back. Shows the change before the server answers. */
export function useCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date, done }: { id: number; date: string; done: boolean }) => {
      const res = await api.habits[":id"].checkins[":date"].$put({
        param: { id: String(id), date },
        json: { done },
      });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onMutate: async ({ id, date, done }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<Habit[]>(key);
      queryClient.setQueryData<Habit[]>(key, (habits) =>
        habits?.map((habit) =>
          habit.id !== id
            ? habit
            : {
                ...habit,
                doneToday: habit.days.at(-1)?.date === date ? done : habit.doneToday,
                days: habit.days.map((day) =>
                  day.date === date ? { ...day, state: done ? "done" : "open" } : day,
                ),
              },
        ),
      );
      return { before };
    },
    onError: (_error, _input, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}
