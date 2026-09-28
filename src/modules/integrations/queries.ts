import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type { ReminderKind } from "../../shared/reminders";

const key = ["integrations", "home-assistant"] as const;

/** Whether each webhook is set, and how the last send went. */
export function useHomeAssistantStatus() {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await api.integrations["home-assistant"].$get();
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
  });
}

/** The summary as Home Assistant would get it now. Loaded when asked for. */
export function useSummaryPreview(enabled: boolean) {
  return useQuery({
    queryKey: [...key, "summary"],
    queryFn: async () => {
      const res = await api.integrations["home-assistant"].summary.$get();
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    enabled,
  });
}

function useSend(send: () => Promise<Response>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await send();
      if (!res.ok) throw await toApiError(res);
      return res.json() as Promise<{ at: string; ok: boolean; detail: string }>;
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useSendSummary() {
  return useSend(() => api.integrations["home-assistant"].summary.send.$post());
}

export function useSendTestReminder() {
  return useSend(() => api.integrations["home-assistant"].reminder.test.$post());
}

const remindersKey = ["integrations", "reminders"] as const;

/** What each reminder would say now, and the latest sent. */
export function useReminders() {
  return useQuery({
    queryKey: remindersKey,
    queryFn: async () => {
      const res = await api.integrations.reminders.$get();
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
  });
}

/** Sends one reminder now; it counts as today's. */
export function useSendReminderNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (kind: ReminderKind) => {
      const res = await api.integrations.reminders[":kind"].send.$post({ param: { kind } });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: remindersKey });
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
