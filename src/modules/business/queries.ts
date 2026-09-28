import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type {
  GearCreate,
  GearUpdate,
  LeadCreate,
  LeadUpdate,
  NoteCreate,
  NoteUpdate,
  SkillCreate,
  SkillUpdate,
  StepCreate,
  StepUpdate,
} from "../../shared/business";

const key = ["business"] as const;

async function fetchBusiness() {
  const res = await api.business.$get();
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export type Business = Awaited<ReturnType<typeof fetchBusiness>>;
export type Phase = Business["phases"][number];
export type Step = Phase["steps"][number];
export type Gear = Business["gear"][number];
export type Skill = Business["skills"][number];
export type Lead = Business["leads"][number];
export type Note = Business["notes"][number];

/** The whole Business page: plan, gear, skills, leads, and notes. */
export function useBusiness() {
  return useQuery({ queryKey: key, queryFn: fetchBusiness });
}

function useBusinessMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    // Waiting for the refetch keeps the change pending until the page shows it.
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

async function ok(res: Response) {
  if (!res.ok) throw await toApiError(res);
}

const param = (id: number) => ({ param: { id: String(id) } });

// Plan

export function useCreatePhase() {
  return useBusinessMutation(async (name: string) => {
    const res = await api.business.phases.$post({ json: { name } });
    await ok(res);
    return res.json();
  });
}

export function useStarterPhases() {
  return useBusinessMutation(async () => ok(await api.business.phases.starter.$post()));
}

export function useRenamePhase() {
  return useBusinessMutation(async ({ id, name }: { id: number; name: string }) =>
    ok(await api.business.phases[":id"].$patch({ ...param(id), json: { name } })),
  );
}

export function useDeletePhase() {
  return useBusinessMutation(async (id: number) =>
    ok(await api.business.phases[":id"].$delete(param(id))),
  );
}

export function useCreateStep() {
  return useBusinessMutation(async (json: StepCreate) =>
    ok(await api.business.steps.$post({ json })),
  );
}

export function useUpdateStep() {
  return useBusinessMutation(async ({ id, patch }: { id: number; patch: StepUpdate }) =>
    ok(await api.business.steps[":id"].$patch({ ...param(id), json: patch })),
  );
}

export function useMoveStep() {
  return useBusinessMutation(async ({ id, to }: { id: number; to: "earlier" | "later" }) =>
    ok(await api.business.steps[":id"].move.$post({ ...param(id), json: { to } })),
  );
}

export function useDeleteStep() {
  return useBusinessMutation(async (id: number) =>
    ok(await api.business.steps[":id"].$delete(param(id))),
  );
}

// Gear, skills, leads, and notes: the same four calls each.

export function useSaveGear() {
  return useBusinessMutation(
    async ({ id, json }: { id: number | null; json: GearCreate & GearUpdate }) =>
      ok(
        id === null
          ? await api.business.gear.$post({ json })
          : await api.business.gear[":id"].$patch({ ...param(id), json }),
      ),
  );
}

export function useDeleteGear() {
  return useBusinessMutation(async (id: number) =>
    ok(await api.business.gear[":id"].$delete(param(id))),
  );
}

export function useSaveSkill() {
  return useBusinessMutation(
    async ({ id, json }: { id: number | null; json: SkillCreate & SkillUpdate }) =>
      ok(
        id === null
          ? await api.business.skills.$post({ json })
          : await api.business.skills[":id"].$patch({ ...param(id), json }),
      ),
  );
}

export function useDeleteSkill() {
  return useBusinessMutation(async (id: number) =>
    ok(await api.business.skills[":id"].$delete(param(id))),
  );
}

export function useSaveLead() {
  return useBusinessMutation(
    async ({ id, json }: { id: number | null; json: LeadCreate & LeadUpdate }) =>
      ok(
        id === null
          ? await api.business.leads.$post({ json })
          : await api.business.leads[":id"].$patch({ ...param(id), json }),
      ),
  );
}

export function useDeleteLead() {
  return useBusinessMutation(async (id: number) =>
    ok(await api.business.leads[":id"].$delete(param(id))),
  );
}

export function useSaveNote() {
  return useBusinessMutation(
    async ({ id, json }: { id: number | null; json: NoteCreate & NoteUpdate }) =>
      ok(
        id === null
          ? await api.business.notes.$post({ json })
          : await api.business.notes[":id"].$patch({ ...param(id), json }),
      ),
  );
}

export function useDeleteNote() {
  return useBusinessMutation(async (id: number) =>
    ok(await api.business.notes[":id"].$delete(param(id))),
  );
}
