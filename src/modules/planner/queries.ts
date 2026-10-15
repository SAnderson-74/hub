import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type { ReviewStepId } from "../../shared/planner";

async function fetchCalendar(from: string, to: string) {
  const res = await api.planner.calendar.$get({ query: { from, to } });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

async function fetchReview() {
  const res = await api.planner.review.$get();
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export type CalendarData = Awaited<ReturnType<typeof fetchCalendar>>;
export type CalendarItem = CalendarData["items"][number];
export type Review = Awaited<ReturnType<typeof fetchReview>>;
export type ReviewStep = Review["steps"][number];

const reviewKey = ["planner", "review"] as const;
/** Review saves run one after another, so the last answer is always the newest. */
const reviewScope = { id: "weekly-review" };

/** Everything dated from `from` through `to`. Keeps the last month showing while the next loads. */
export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: ["planner", "calendar", from, to],
    queryFn: () => fetchCalendar(from, to),
    placeholderData: keepPreviousData,
  });
}

/** This week's review. Counts change as things get fixed elsewhere, so it refetches on focus. */
export function useReview() {
  return useQuery({ queryKey: reviewKey, queryFn: fetchReview, refetchOnWindowFocus: "always" });
}

export function useTickStep() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: reviewScope,
    mutationFn: async ({ step, done }: { step: ReviewStepId; done: boolean }) => {
      const res = await api.planner.review.steps[":step"].$put({ param: { step }, json: { done } });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    // Shows the tick at once, and takes it back if saving fails.
    onMutate: ({ step, done }) => {
      void queryClient.cancelQueries({ queryKey: reviewKey });
      const before = queryClient.getQueryData<Review>(reviewKey);
      if (before) {
        queryClient.setQueryData<Review>(reviewKey, {
          ...before,
          steps: before.steps.map((item) => (item.id === step ? { ...item, done } : item)),
        });
      }
      return { before };
    },
    onError: (_error, _variables, context) => {
      if (context?.before) queryClient.setQueryData(reviewKey, context.before);
    },
    onSuccess: (review) => queryClient.setQueryData(reviewKey, review),
  });
}

export function useFinishReview() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: reviewScope,
    mutationFn: async (finished: boolean) => {
      const res = await api.planner.review.finished.$put({ json: { finished } });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSuccess: (review) => queryClient.setQueryData(reviewKey, review),
  });
}
