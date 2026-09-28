import { Plus } from "lucide-react";
import { useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { primaryButton } from "../../../client/components/ui";
import {
  SKILL_KIND_LABELS,
  SKILL_KINDS,
  SKILL_STATUS_LABELS,
  SKILL_STATUSES,
  type SkillCreate,
} from "../../../shared/business";
import { formatShortDate } from "../../tasks/dates";
import { type Skill, useDeleteSkill, useSaveSkill } from "../queries";
import { expiryStatus } from "../summary";
import { type FieldSpec, RecordSheet, toFormValues } from "./RecordSheet";
import { Group, Row } from "./Row";

const FIELDS: FieldSpec[] = [
  {
    name: "name",
    label: "Name",
    kind: "text",
    maxLength: 120,
    required: "Give the skill a name.",
    placeholder: "Like First aid",
  },
  {
    name: "kind",
    label: "Kind",
    kind: "select",
    options: SKILL_KINDS.map((kind) => [kind, SKILL_KIND_LABELS[kind]] as const),
    half: true,
  },
  {
    name: "status",
    label: "Status",
    kind: "select",
    options: SKILL_STATUSES.map((status) => [status, SKILL_STATUS_LABELS[status]] as const),
    half: true,
  },
  { name: "earnedOn", label: "Earned on", kind: "date", half: true },
  {
    name: "expiresOn",
    label: "Expires on",
    kind: "date",
    half: true,
    hint: "For certifications that need renewing.",
  },
  { name: "notes", label: "Notes", kind: "textarea", placeholder: "Where to study, what it costs" },
];

const TONES = { danger: "text-danger", warn: "text-warn", muted: "text-muted" } as const;

/** Skills and certifications: what you have, are learning, and plan to get. */
export function SkillsView({ skills, today }: { skills: Skill[]; today: string }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const save = useSaveSkill();
  const remove = useDeleteSkill();
  const current = typeof editing === "number" ? skills.find((item) => item.id === editing) : null;

  return (
    <Panel
      title="Skills and certifications"
      description="What you can offer, what you're learning, and what needs renewing."
      action={
        <button type="button" className={primaryButton} onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" className="size-5" />
          Add skill
        </button>
      }
    >
      {skills.length === 0 ? (
        <p className="text-sm text-muted">
          No skills yet. Add what you know and the certifications you have or want.
        </p>
      ) : (
        <div className="space-y-5">
          {SKILL_STATUSES.map((status) => {
            const items = skills.filter((item) => item.status === status);
            if (items.length === 0) return null;
            return (
              <Group key={status} title={SKILL_STATUS_LABELS[status]}>
                {items.map((item) => {
                  const expiry = expiryStatus(item.expiresOn, today);
                  const expires = item.expiresOn ? formatShortDate(item.expiresOn, today) : "";
                  return (
                    <li key={item.id}>
                      <Row
                        title={item.name}
                        meta={
                          <>
                            {[
                              SKILL_KIND_LABELS[item.kind],
                              item.earnedOn
                                ? `Earned ${formatShortDate(item.earnedOn, today)}`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            {expiry ? (
                              <>
                                {" · "}
                                <span className={TONES[expiry.tone]}>
                                  {expiry.expired
                                    ? `Expired ${expires}`
                                    : expiry.soon
                                      ? `Expires soon, ${expires}`
                                      : `Expires ${expires}`}
                                </span>
                              </>
                            ) : null}
                          </>
                        }
                        onOpen={() => setEditing(item.id)}
                      />
                    </li>
                  );
                })}
              </Group>
            );
          })}
        </div>
      )}

      {editing === "new" || current ? (
        <RecordSheet
          key={current?.id ?? "new"}
          open
          onClose={() => setEditing(null)}
          title={current ? "Skill" : "Add skill"}
          noun="skill"
          fields={FIELDS}
          initial={toFormValues(FIELDS, current ?? null)}
          isNew={!current}
          onSave={(values) =>
            save.mutateAsync({ id: current?.id ?? null, json: values as SkillCreate })
          }
          onDelete={current ? () => remove.mutateAsync(current.id) : undefined}
        />
      ) : null}
    </Panel>
  );
}
