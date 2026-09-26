import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type {
  AssessmentCreate,
  AssessmentUpdate,
  CourseCreate,
  CourseUpdate,
  EducationImport,
  TermCreate,
  TermUpdate,
} from "../../shared/education";

async function fetchTerms() {
  const res = await api.education.terms.$get();
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export type Term = Awaited<ReturnType<typeof fetchTerms>>[number];
export type Course = Term["courses"][number];

const keys = { terms: ["education", "terms"] as const };

export function useTerms() {
  return useQuery({ queryKey: keys.terms, queryFn: fetchTerms });
}

type Terms = Awaited<ReturnType<typeof fetchTerms>>;

/** Every write answers with all terms, which replace the cached copy. */
function useTermsMutation<Input>(request: (input: Input) => Promise<Terms | undefined>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (terms) => {
      if (terms) queryClient.setQueryData(keys.terms, terms);
      else void queryClient.invalidateQueries({ queryKey: keys.terms });
    },
  });
}

async function ok<T>(res: { ok: boolean; status: number; json(): Promise<unknown> }): Promise<T> {
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export function useCreateTerm() {
  return useTermsMutation((json: TermCreate) =>
    api.education.terms.$post({ json }).then(ok<Terms>),
  );
}

export function useUpdateTerm() {
  return useTermsMutation(({ id, patch }: { id: number; patch: TermUpdate }) =>
    api.education.terms[":id"].$patch({ param: { id: String(id) }, json: patch }).then(ok<Terms>),
  );
}

export function useDeleteTerm() {
  return useTermsMutation(async (id: number) => {
    const res = await api.education.terms[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
    return undefined;
  });
}

export function useCreateCourse() {
  return useTermsMutation((json: CourseCreate) =>
    api.education.courses.$post({ json }).then(ok<Terms>),
  );
}

export function useUpdateCourse() {
  return useTermsMutation(({ id, patch }: { id: number; patch: CourseUpdate }) =>
    api.education.courses[":id"].$patch({ param: { id: String(id) }, json: patch }).then(ok<Terms>),
  );
}

export function useDeleteCourse() {
  return useTermsMutation((id: number) =>
    api.education.courses[":id"].$delete({ param: { id: String(id) } }).then(ok<Terms>),
  );
}

export function useAddAssessment() {
  return useTermsMutation(({ courseId, json }: { courseId: number; json: AssessmentCreate }) =>
    api.education.courses[":id"].assessments
      .$post({ param: { id: String(courseId) }, json })
      .then(ok<Terms>),
  );
}

export function useUpdateAssessment() {
  return useTermsMutation(({ id, patch }: { id: number; patch: AssessmentUpdate }) =>
    api.education.assessments[":id"]
      .$patch({ param: { id: String(id) }, json: patch })
      .then(ok<Terms>),
  );
}

export function useDeleteAssessment() {
  return useTermsMutation((id: number) =>
    api.education.assessments[":id"].$delete({ param: { id: String(id) } }).then(ok<Terms>),
  );
}

/** Time and settings changes refresh the streak through this key. */
export const streakKey = ["education", "streak"] as const;

/** The study streak. It refetches each minute so a running course timer and midnight show up. */
export function useStudyStreak() {
  return useQuery({
    queryKey: streakKey,
    queryFn: async () => {
      const res = await api.education.streak.$get();
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    refetchInterval: 60_000,
  });
}

/** Previews (dryRun) or runs a hub-education/v1 import. */
export function useImportEducation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data, dryRun }: { data: EducationImport; dryRun: boolean }) => {
      const res = await api.education.import.$post({
        query: dryRun ? { dryRun: "true" } : {},
        json: data,
      });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSuccess: (_summary, { dryRun }) => {
      if (!dryRun) void queryClient.invalidateQueries({ queryKey: keys.terms });
    },
  });
}
