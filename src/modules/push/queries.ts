import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type { PushSubscribe, PushUpdate } from "../../shared/push";

const key = ["push"] as const;

export type PushStatus = Awaited<ReturnType<typeof fetchStatus>>;
export type PushDevice = PushStatus["devices"][number];

async function fetchStatus() {
  const res = await api.push.$get();
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

/** The devices with notifications on. */
export function usePushStatus() {
  return useQuery({ queryKey: key, queryFn: fetchStatus });
}

function usePushMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      // Reminders say whether they have anywhere to go.
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
}

/** Makes Hub's signing keys if needed; answers with the public one. */
export async function preparePushKeys(): Promise<string> {
  const res = await api.push.keys.$post();
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).publicKey;
}

export function useAddPushDevice() {
  return usePushMutation(async (json: PushSubscribe) => {
    const res = await api.push.devices.$post({ json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useUpdatePushDevice() {
  return usePushMutation(async ({ id, patch }: { id: number; patch: PushUpdate }) => {
    const res = await api.push.devices[":id"].$patch({ param: { id: String(id) }, json: patch });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useRemovePushDevice() {
  return usePushMutation(async (id: number) => {
    const res = await api.push.devices[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
  });
}

export function useTestPush() {
  return usePushMutation(async (id: number) => {
    const res = await api.push.devices[":id"].test.$post({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}
