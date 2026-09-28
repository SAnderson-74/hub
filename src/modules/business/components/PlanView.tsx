import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { ProgressBar } from "../../../client/components/ProgressBar";
import { Stat } from "../../../client/components/Stat";
import {
  iconButton,
  inputClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { formatCents } from "../../../shared/money";
import { describeDue } from "../../tasks/dates";
import {
  type Phase,
  type Step,
  useCreatePhase,
  useCreateStep,
  useDeletePhase,
  useDeleteStep,
  useMoveStep,
  useRenamePhase,
  useStarterPhases,
  useUpdateStep,
} from "../queries";
import { phaseLine, planTotals } from "../summary";
import { type FieldSpec, RecordSheet, toFormValues } from "./RecordSheet";

const TONES = { danger: "text-danger", warn: "text-warn", muted: "text-muted" } as const;

/** The phased plan: each phase's steps, with costs and progress. */
export function PlanView({ phases, today }: { phases: Phase[]; today: string }) {
  // Ids, so an open sheet always shows the saved version and closes if it's deleted.
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [editingPhaseId, setEditingPhaseId] = useState<number | null>(null);
  const editingStep = phases
    .flatMap((phase) => phase.steps)
    .find((step) => step.id === editingStepId);
  const editingPhase = phases.find((phase) => phase.id === editingPhaseId);
  const starter = useStarterPhases();
  const all = planTotals(phases.flatMap((phase) => phase.steps));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
      {phases.length === 0 ? (
        <Panel
          title="Start your plan"
          description="Break getting the business going into phases, then list the steps in each, with what they should cost."
          className="lg:col-span-12"
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={starter.isPending}
              onClick={() => starter.mutate()}
            >
              Start with three phases
            </button>
          </div>
          <p className="mt-2 text-sm text-muted">
            Research, Set up, and Launch. Rename them anytime.
          </p>
          <div className="mt-4">
            <AddPhase />
          </div>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:col-span-12 lg:grid-cols-4">
            <Stat label="Steps done" value={`${all.done} of ${all.steps}`} />
            <Stat label="Estimated cost" value={formatCents(all.estimateCents)} />
            <Stat label="Spent so far" value={formatCents(all.spentCents)} />
            <Stat
              label="Left to spend"
              value={formatCents(all.leftCents)}
              note="Estimates of steps not done"
            />
          </div>
          {phases.map((phase) => (
            <PhasePanel
              key={phase.id}
              phase={phase}
              today={today}
              onEditPhase={() => setEditingPhaseId(phase.id)}
              onEditStep={(step) => setEditingStepId(step.id)}
            />
          ))}
          <div className="lg:col-span-12">
            <AddPhase />
          </div>
        </>
      )}

      {editingStep ? (
        <StepSheet
          key={editingStep.id}
          step={editingStep}
          phases={phases}
          onClose={() => setEditingStepId(null)}
        />
      ) : null}
      {editingPhase ? (
        <PhaseSheet
          key={editingPhase.id}
          phase={editingPhase}
          onClose={() => setEditingPhaseId(null)}
        />
      ) : null}
    </div>
  );
}

function PhasePanel({
  phase,
  today,
  onEditPhase,
  onEditStep,
}: {
  phase: Phase;
  today: string;
  onEditPhase: () => void;
  onEditStep: (step: Step) => void;
}) {
  const totals = planTotals(phase.steps);
  const percent = totals.steps === 0 ? 0 : Math.round((totals.done / totals.steps) * 100);
  return (
    <Panel
      title={phase.name}
      description={phaseLine(totals)}
      action={
        <button
          type="button"
          className={iconButton}
          aria-label={`Edit phase ${phase.name}`}
          onClick={onEditPhase}
        >
          <Pencil aria-hidden="true" className="size-4" />
        </button>
      }
      className="lg:col-span-6"
    >
      {totals.steps > 0 ? (
        <div className="mb-3">
          <ProgressBar
            percent={percent}
            label={`${phase.name}: ${totals.done} of ${totals.steps} steps done`}
            complete={totals.done === totals.steps}
          />
        </div>
      ) : null}
      <ul className="space-y-2">
        {phase.steps.map((step) => (
          <StepRow key={step.id} step={step} today={today} onEdit={() => onEditStep(step)} />
        ))}
      </ul>
      <AddStep phase={phase} />
    </Panel>
  );
}

function StepRow({ step, today, onEdit }: { step: Step; today: string; onEdit: () => void }) {
  const update = useUpdateStep();
  // Set in the click itself, so the box shows the new state at once while it saves.
  const [saving, setSaving] = useState<boolean | null>(null);
  const done = saving ?? step.done;
  const due = step.dueOn && !done ? describeDue(step.dueOn, today) : null;
  const cost =
    step.spentCents !== null
      ? `${formatCents(step.spentCents)} spent`
      : step.estimateCents
        ? `About ${formatCents(step.estimateCents)}`
        : "";
  return (
    <li className="flex items-center gap-1 rounded-tile bg-base/80 pl-1 ring-1 ring-surface-0/50">
      <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={done}
          disabled={saving !== null}
          onChange={(event) => {
            const checked = event.target.checked;
            setSaving(checked);
            update.mutate(
              { id: step.id, patch: { done: checked } },
              { onSettled: () => setSaving(null) },
            );
          }}
          aria-label={`${step.title} done`}
          className="size-5 accent-accent"
        />
      </label>
      <button
        type="button"
        onClick={onEdit}
        className="min-h-12 min-w-0 flex-1 py-2 pr-4 text-left"
      >
        <span
          className={`block break-words ${done ? "text-muted line-through" : "font-semibold text-fg"}`}
        >
          {step.title}
        </span>
        {due || cost ? (
          <span className="block text-sm">
            {due ? <span className={TONES[due.tone]}>{due.label}</span> : null}
            {due && cost ? <span className="text-muted"> · </span> : null}
            {cost ? <span className="text-muted">{cost}</span> : null}
          </span>
        ) : null}
      </button>
      {update.error ? (
        <p role="alert" className="sr-only">
          {update.error.message}
        </p>
      ) : null}
    </li>
  );
}

function AddStep({ phase }: { phase: Phase }) {
  const create = useCreateStep();
  const [title, setTitle] = useState("");
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = title.trim();
    if (!text) return;
    setTitle("");
    create.mutate(
      { phaseId: phase.id, title: text },
      { onError: () => setTitle((current) => current || text) },
    );
  };
  return (
    <form onSubmit={onSubmit} className="mt-3 flex gap-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        placeholder="Add a step"
        aria-label={`New step in ${phase.name}`}
        className={`${inputClass} min-w-0`}
      />
      <button
        type="submit"
        aria-label={`Add step to ${phase.name}`}
        disabled={title.trim() === "" || create.isPending}
        className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-0 text-fg hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus aria-hidden="true" className="size-5" />
      </button>
      {create.error ? (
        <p role="alert" className="sr-only">
          {create.error.message}
        </p>
      ) : null}
    </form>
  );
}

function AddPhase() {
  const ids = useId();
  const create = useCreatePhase();
  const [name, setName] = useState("");
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = name.trim();
    if (!text) return;
    create.mutate(text, { onSuccess: () => setName("") });
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
      <label htmlFor={`${ids}-phase`} className="sr-only">
        New phase name
      </label>
      <input
        id={`${ids}-phase`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={80}
        placeholder="New phase"
        className={`${inputClass} min-w-0 flex-1 sm:max-w-sm`}
      />
      <button
        type="submit"
        className={secondaryButton}
        disabled={name.trim() === "" || create.isPending}
      >
        <Plus aria-hidden="true" className="size-4" />
        Add phase
      </button>
      {create.error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {create.error.message}
        </p>
      ) : null}
    </form>
  );
}

function StepSheet({
  step,
  phases,
  onClose,
}: {
  step: Step;
  phases: Phase[];
  onClose: () => void;
}) {
  const update = useUpdateStep();
  const remove = useDeleteStep();
  const move = useMoveStep();
  const fields: FieldSpec[] = [
    {
      name: "title",
      label: "Step",
      kind: "text",
      maxLength: 200,
      required: "Say what the step is.",
    },
    {
      name: "phaseId",
      label: "Phase",
      kind: "select",
      options: phases.map((phase) => [String(phase.id), phase.name] as const),
    },
    {
      name: "estimateCents",
      label: "Estimated cost",
      kind: "money",
      placeholder: "0.00",
      half: true,
    },
    { name: "spentCents", label: "Spent", kind: "money", placeholder: "0.00", half: true },
    { name: "dueOn", label: "Due", kind: "date", half: true },
    { name: "done", label: "Done", kind: "checkbox", half: true },
    { name: "notes", label: "Notes", kind: "textarea" },
  ];
  const siblings = phases.find((phase) => phase.id === step.phaseId)?.steps ?? [];
  const index = siblings.findIndex((item) => item.id === step.id);
  return (
    <RecordSheet
      open
      onClose={onClose}
      title="Step"
      noun="step"
      fields={fields}
      initial={toFormValues(fields, { ...step, phaseId: String(step.phaseId) })}
      isNew={false}
      onSave={({ phaseId, ...values }) =>
        update.mutateAsync({ id: step.id, patch: { ...values, phaseId: Number(phaseId) } })
      }
      onDelete={() => remove.mutateAsync(step.id)}
    >
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButton}
          disabled={index <= 0 || move.isPending}
          onClick={() => move.mutate({ id: step.id, to: "earlier" })}
        >
          <ArrowUp aria-hidden="true" className="size-4" />
          Move earlier
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={index === -1 || index >= siblings.length - 1 || move.isPending}
          onClick={() => move.mutate({ id: step.id, to: "later" })}
        >
          <ArrowDown aria-hidden="true" className="size-4" />
          Move later
        </button>
      </div>
    </RecordSheet>
  );
}

function PhaseSheet({ phase, onClose }: { phase: Phase; onClose: () => void }) {
  const rename = useRenamePhase();
  const remove = useDeletePhase();
  const fields: FieldSpec[] = [
    {
      name: "name",
      label: "Name",
      kind: "text",
      maxLength: 80,
      required: "Give the phase a name.",
    },
  ];
  return (
    <RecordSheet
      open
      onClose={onClose}
      title="Phase"
      noun="phase"
      fields={fields}
      initial={toFormValues(fields, phase)}
      isNew={false}
      onSave={({ name }) => rename.mutateAsync({ id: phase.id, name: String(name) })}
      onDelete={() => remove.mutateAsync(phase.id)}
      deleteWarning={
        phase.steps.length > 0
          ? `Its ${phase.steps.length} ${phase.steps.length === 1 ? "step goes" : "steps go"} too.`
          : undefined
      }
    />
  );
}
