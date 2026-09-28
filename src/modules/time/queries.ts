import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type { EntityRef } from "../../shared/entities";
import type { TimeEntryCreate, TimeEntryUpdate, TimerStart } from "../../shared/time";
import { streakKey } from "../education/queries";
import { resaleItemsKey } from "../resale/queries";

async function fetchTimers() {
  const res = await api.time.timers.$get();
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).timers;
}

/** Entries that started in [from, to), or all entries for one subject. */
export type EntryFilter = { from: Date; to: Date } | { subject: EntityRef };

async function fetchEntries(filter: EntryFilter) {
  const query =
    "subject" in filter
      ? { type: filter.subject.type, id: String(filter.subject.id) }
      : { from: filter.from.toISOString(), to: filter.to.toISOString() };
  const res = await api.time.entries.$get({ query });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export type TimeEntry = Awaited<ReturnType<typeof fetchEntries>>[number];

const keys = {
  all: ["time"] as const,
  timers: ["time", "timers"] as const,
  entries: (filter: EntryFilter) =>
    "subject" in filter
      ? (["time", "entries", filter.subject.type, filter.subject.id] as const)
      : (["time", "entries", filter.from.getTime(), filter.to.getTime()] as const),
};

/** Running timers, oldest first. */
export function useTimers() {
  return useQuery({ queryKey: keys.timers, queryFn: fetchTimers });
}

export type RunningTimer = NonNullable<ReturnType<typeof useTimers>["data"]>[number];

export function useEntries(filter: EntryFilter) {
  return useQuery({ queryKey: keys.entries(filter), queryFn: () => fetchEntries(filter) });
}

function useTimeMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.all });
      // Time counts toward the study streak and each resale item's time spent.
      void queryClient.invalidateQueries({ queryKey: streakKey });
      void queryClient.invalidateQueries({ queryKey: resaleItemsKey });
    },
  });
}

export function useStartTimer() {
  return useTimeMutation(async (json: TimerStart) => {
    const res = await api.time.timer.$post({ json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

/** Stops one timer. */
export function useStopTimer() {
  return useTimeMutation(async (id: number) => {
    const res = await api.time.entries[":id"].stop.$post({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useStopAllTimers() {
  return useTimeMutation(async (_: undefined) => {
    const res = await api.time.timer.stop.$post();
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

/** Creates an entry, or updates one when an id is given. */
export function useSaveEntry() {
  return useTimeMutation(
    async (input: { id: null; json: TimeEntryCreate } | { id: number; json: TimeEntryUpdate }) => {
      const res =
        input.id === null
          ? await api.time.entries.$post({ json: input.json })
          : await api.time.entries[":id"].$patch({
              param: { id: String(input.id) },
              json: input.json,
            });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
  );
}

export function useDeleteEntry() {
  return useTimeMutation(async (id: number) => {
    const res = await api.time.entries[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
  });
}
