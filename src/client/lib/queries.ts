import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SettingsPatch } from "../../shared/settings";
import { api, toApiError } from "./api";

export function useSystem() {
  return useQuery({
    queryKey: ["system"],
    queryFn: async () => {
      const res = await api.system.$get();
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    refetchInterval: 60_000,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await api.settings.$get();
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: SettingsPatch) => {
      const res = await api.settings.$put({ json: patch });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(["settings"], settings);
    },
  });
}
