import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultModules, type ModuleSettings } from "../../shared/modules";
import type { SettingsPatch } from "../../shared/settings";
import type { SetupInput } from "../../shared/setup";
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

export function useBackups() {
  return useQuery({
    queryKey: ["backups"],
    queryFn: async () => {
      const res = await api.backups.$get();
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
  });
}

/** Restores a listed backup (by name) or a chosen file. Hub restarts afterwards. */
export function useRestoreBackup() {
  return useMutation({
    mutationFn: async (from: { name: string } | { file: File }) => {
      const res =
        "name" in from
          ? await api.backups[":name"].restore.$post({ param: { name: from.name } })
          : await fetch("/api/backups/upload", {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: from.file,
            });
      if (!res.ok) throw await toApiError(res);
      return (await res.json()) as { message: string };
    },
  });
}

/** Whether first-run setup is needed, the server's time zone, and whether example data is in. */
export function useSetup() {
  return useQuery({
    queryKey: ["setup"],
    queryFn: async () => {
      const res = await api.setup.$get();
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
  });
}

export function useFinishSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (json: SetupInput) => {
      const res = await api.setup.$post({ json });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    // Everything may have changed: settings, the time zone, and example data.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}

export function useRemoveDemo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (_: undefined) => {
      const res = await api.setup.demo.remove.$post();
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}

/** Which modules are on. All of them until settings load. */
export function useModules(): ModuleSettings {
  return useSettings().data?.modules ?? defaultModules;
}
