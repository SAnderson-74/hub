import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type {
  CostCreate,
  ItemCreate,
  ItemUpdate,
  LinkRole,
  ListingCreate,
  ListingUpdate,
  PlatformCreate,
  PlatformUpdate,
  PriceChange,
  TransactionLink,
  TransactionRecord,
} from "../../shared/resale";
import type { ImportRow } from "../../shared/resaleImport";
import type { ListingImport } from "../../shared/resaleListing";

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
export type Listing = Item["listings"][number];

/** Time changes refresh items (their time spent) through this key. */
export const resaleItemsKey = ["resale", "items"] as const;

const keys = {
  all: ["resale"] as const,
  items: resaleItemsKey,
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

export function useAddCost() {
  return useResaleMutation(async ({ itemId, json }: { itemId: number; json: CostCreate }) => {
    const res = await api.resale.items[":id"].costs.$post({
      param: { id: String(itemId) },
      json,
    });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useDeleteCost() {
  return useResaleMutation(async (id: number) => {
    const res = await api.resale.costs[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useAddListing() {
  return useResaleMutation(async ({ itemId, json }: { itemId: number; json: ListingCreate }) => {
    const res = await api.resale.items[":id"].listings.$post({
      param: { id: String(itemId) },
      json,
    });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useUpdateListing() {
  return useResaleMutation(async ({ id, patch }: { id: number; patch: ListingUpdate }) => {
    const res = await api.resale.listings[":id"].$patch({ param: { id: String(id) }, json: patch });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useChangePrice() {
  return useResaleMutation(async ({ id, json }: { id: number; json: PriceChange }) => {
    const res = await api.resale.listings[":id"].prices.$post({ param: { id: String(id) }, json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useDeleteListing() {
  return useResaleMutation(async (id: number) => {
    const res = await api.resale.listings[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
    return res.json();
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

/** Previews (dryRun) or runs a CSV import of mapped rows. */
export function useImportResale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows, dryRun }: { rows: ImportRow[]; dryRun: boolean }) => {
      const res = await api.resale.import.$post({
        query: dryRun ? { dryRun: "true" } : {},
        json: { rows },
      });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSuccess: (_result, { dryRun }) => {
      if (!dryRun) void queryClient.invalidateQueries({ queryKey: keys.all });
    },
  });
}

/** Previews (dryRun) or adds a hub-listing/v1 listing. */
export function useImportListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data, dryRun }: { data: ListingImport; dryRun: boolean }) => {
      const res = await api.resale["listing-import"].$post({
        query: dryRun ? { dryRun: "true" } : {},
        json: data,
      });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSuccess: (_result, { dryRun }) => {
      if (!dryRun) void queryClient.invalidateQueries({ queryKey: keys.all });
    },
  });
}

// Money transactions linked to items

export type ItemTransaction = Item["transactions"][number];

/** Links change both sides, so they refresh money (and goals that count balances) too. */
function useLinkMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.all });
      void queryClient.invalidateQueries({ queryKey: ["money"] });
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

/** Transactions that could be the item's purchase or sale, best first. */
export function useTransactionMatches(itemId: number, role: LinkRole, q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["resale", "matches", itemId, role, q],
    queryFn: async () => {
      const res = await api.resale.items[":id"]["transaction-matches"].$get({
        param: { id: String(itemId) },
        query: q ? { role, q } : { role },
      });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}

export type TransactionMatch = NonNullable<
  ReturnType<typeof useTransactionMatches>["data"]
>[number];

export function useLinkTransaction() {
  return useLinkMutation(async ({ itemId, json }: { itemId: number; json: TransactionLink }) => {
    const res = await api.resale.items[":id"].transactions.$post({
      param: { id: String(itemId) },
      json,
    });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useUnlinkTransaction() {
  return useLinkMutation(
    async ({ itemId, transactionId }: { itemId: number; transactionId: number }) => {
      const res = await api.resale.items[":id"].transactions[":transactionId"].$delete({
        param: { id: String(itemId), transactionId: String(transactionId) },
      });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
  );
}

export function useRecordTransaction() {
  return useLinkMutation(async ({ itemId, json }: { itemId: number; json: TransactionRecord }) => {
    const res = await api.resale.items[":id"]["record-transaction"].$post({
      param: { id: String(itemId) },
      json,
    });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}
