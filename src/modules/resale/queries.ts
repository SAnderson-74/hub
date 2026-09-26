import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type { ItemCreate, ItemUpdate, PlatformCreate, PlatformUpdate } from "../../shared/resale";

async function fetchItems() {
  const res = await api.resale.items.$get({ query: {} });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

async function fetchPlatforms() {
  const res = await api.resale.platforms.$get();
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export type Item = Awaited<ReturnType<typeof fetchItems>>[number];
export type Platform = Awaited<ReturnType<typeof fetchPlatforms>>[number];

const keys = {
  all: ["resale"] as const,
  items: ["resale", "items"] as const,
  platforms: ["resale", "platforms"] as const,
};

/** Every item, newest first. The page filters by status itself. */
export function useItems() {
  return useQuery({ queryKey: keys.items, queryFn: fetchItems });
}

export function usePlatforms() {
  return useQuery({ queryKey: keys.platforms, queryFn: fetchPlatforms });
}

/** Item writes refresh items and platforms (whose item counts change too). */
function useResaleMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useCreateItem() {
  return useResaleMutation(async (json: ItemCreate) => {
    const res = await api.resale.items.$post({ json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useUpdateItem() {
  return useResaleMutation(async ({ id, patch }: { id: number; patch: ItemUpdate }) => {
    const res = await api.resale.items[":id"].$patch({ param: { id: String(id) }, json: patch });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useDeleteItem() {
  return useResaleMutation(async (id: number) => {
    const res = await api.resale.items[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
  });
}

/** Platform writes answer with every platform, which replaces the cached list. */
function usePlatformMutation<Input>(
  request: (input: Input) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Input) => {
      const res = await request(input);
      if (!res.ok) throw await toApiError(res);
      return (await res.json()) as Platform[];
    },
    onSuccess: (platforms) => {
      queryClient.setQueryData(keys.platforms, platforms);
      // Item cards show platform names, which may have changed.
      void queryClient.invalidateQueries({ queryKey: keys.items });
    },
  });
}

export function useCreatePlatform() {
  return usePlatformMutation((json: PlatformCreate) => api.resale.platforms.$post({ json }));
}

export function useUpdatePlatform() {
  return usePlatformMutation(({ id, patch }: { id: number; patch: PlatformUpdate }) =>
    api.resale.platforms[":id"].$patch({ param: { id: String(id) }, json: patch }),
  );
}

export function useDeletePlatform() {
  return usePlatformMutation((id: number) =>
    api.resale.platforms[":id"].$delete({ param: { id: String(id) } }),
  );
}
