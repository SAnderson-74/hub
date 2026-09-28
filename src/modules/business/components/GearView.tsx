import { Plus } from "lucide-react";
import { useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { primaryButton } from "../../../client/components/ui";
import { GEAR_STATUS_LABELS, GEAR_STATUSES, type GearCreate } from "../../../shared/business";
import { formatCents } from "../../../shared/money";
import { formatShortDate } from "../../tasks/dates";
import { type Gear, useDeleteGear, useSaveGear } from "../queries";
import { type FieldSpec, RecordSheet, toFormValues } from "./RecordSheet";
import { Group, Row } from "./Row";

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", kind: "text", maxLength: 120, required: "Give the gear a name." },
  {
    name: "status",
    label: "Status",
    kind: "select",
    options: GEAR_STATUSES.map((status) => [status, GEAR_STATUS_LABELS[status]] as const),
    half: true,
  },
  {
    name: "category",
    label: "Category",
    kind: "text",
    maxLength: 60,
    placeholder: "Optional, like Tools",
    half: true,
  },
  { name: "costCents", label: "Cost", kind: "money", placeholder: "0.00", half: true },
  { name: "acquiredOn", label: "Bought on", kind: "date", half: true },
  {
    name: "notes",
    label: "Notes",
    kind: "textarea",
    placeholder: "Model, serial number, where it's kept",
  },
];

const GROUP_NOTES = {
  need: (cents: number) => (cents > 0 ? `${formatCents(cents)} to buy` : ""),
  ordered: (cents: number) => (cents > 0 ? `${formatCents(cents)} on order` : ""),
  have: (cents: number) => (cents > 0 ? `${formatCents(cents)} spent` : ""),
};

/** Equipment the business needs, has on order, and owns, with what it costs. */
export function GearView({ gear, today }: { gear: Gear[]; today: string }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const save = useSaveGear();
  const remove = useDeleteGear();
  const current = typeof editing === "number" ? gear.find((item) => item.id === editing) : null;

  return (
    <Panel
      title="Gear"
      description="What the business needs, what's on order, and what you own."
      action={
        <button type="button" className={primaryButton} onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" className="size-5" />
          Add gear
        </button>
      }
    >
      {gear.length === 0 ? (
        <p className="text-sm text-muted">No gear yet. Add what you'll need to work.</p>
      ) : (
        <div className="space-y-5">
          {GEAR_STATUSES.map((status) => {
            const items = gear.filter((item) => item.status === status);
            if (items.length === 0) return null;
            const cents = items.reduce((sum, item) => sum + (item.costCents ?? 0), 0);
            return (
              <Group
                key={status}
                title={GEAR_STATUS_LABELS[status]}
                note={GROUP_NOTES[status](cents)}
              >
                {items.map((item) => (
                  <li key={item.id}>
                    <Row
                      title={item.name}
                      meta={
                        [
                          item.category,
                          item.acquiredOn
                            ? `Bought ${formatShortDate(item.acquiredOn, today)}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      }
                      value={item.costCents === null ? undefined : formatCents(item.costCents)}
                      onOpen={() => setEditing(item.id)}
                    />
                  </li>
                ))}
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
          title={current ? "Gear" : "Add gear"}
          noun="gear"
          fields={FIELDS}
          initial={toFormValues(FIELDS, current ?? null)}
          isNew={!current}
          onSave={(values) =>
            save.mutateAsync({ id: current?.id ?? null, json: values as GearCreate })
          }
          onDelete={current ? () => remove.mutateAsync(current.id) : undefined}
        />
      ) : null}
    </Panel>
  );
}
