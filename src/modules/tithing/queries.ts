import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type {
  IncomeSet,
  PaymentCreate,
  PaymentSet,
  TithingImportInput,
} from "../../shared/tithing";

async function fetchOverview(year: number | undefined) {
  const res = await api.tithing.overview.$get({
    query: year === undefined ? {} : { year: String(year) },
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export type Overview = Awaited<ReturnType<typeof fetchOverview>>;
export type IncomeRow = Overview["income"][number];
export type PaymentRow = Overview["payments"][number];
export type Suggestion = Overview["suggestions"][number];

/** The Tithing page's numbers for a year (the current one when none is given). */
export function useOverview(year: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ["tithing", "overview", year ?? "current"],
    queryFn: () => fetchOverview(year),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Money and tithing both change when either does, so refresh both. */
function useTithingMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["tithing"] });
      void queryClient.invalidateQueries({ queryKey: ["money"] });
    },
  });
}

export function useSetIncome() {
  return useTithingMutation(async ({ id, json }: { id: number; json: IncomeSet }) => {
    const res = await api.tithing.income[":id"].$put({ param: { id: String(id) }, json });
    if (!res.ok) throw await toApiError(res);
  });
}

export function useCreatePayment() {
  return useTithingMutation(async (json: PaymentCreate) => {
    const res = await api.tithing.payments.$post({ json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useSetPayment() {
  return useTithingMutation(async ({ id, json }: { id: number; json: PaymentSet }) => {
    const res = await api.tithing.payments[":id"].$put({ param: { id: String(id) }, json });
    if (!res.ok) throw await toApiError(res);
  });
}

export function useClearPayment() {
  return useTithingMutation(async (id: number) => {
    const res = await api.tithing.payments[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
  });
}

/** Previews a pasted hub-tithing/v1 document, or adds it. */
export function useImportTithing() {
  return useTithingMutation(
    async ({ input, dryRun }: { input: TithingImportInput; dryRun: boolean }) => {
      const res = await api.tithing.imports.$post({
        query: { dryRun: dryRun ? "true" : "false" },
        json: input,
      });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
  );
}
