import { Plus } from "lucide-react";
import { useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { Stat } from "../../../client/components/Stat";
import { primaryButton } from "../../../client/components/ui";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  type LeadCreate,
  OPEN_LEAD_STATUSES,
} from "../../../shared/business";
import { formatCents } from "../../../shared/money";
import { describeDue } from "../../tasks/dates";
import { type Lead, useDeleteLead, useSaveLead } from "../queries";
import { leadTotals } from "../summary";
import { type FieldSpec, RecordSheet, toFormValues } from "./RecordSheet";
import { Group, Row } from "./Row";

const FIELDS: FieldSpec[] = [
  {
    name: "name",
    label: "Name",
    kind: "text",
    maxLength: 120,
    required: "Give the lead a name.",
    placeholder: "A person or a company",
  },
  {
    name: "status",
    label: "Status",
    kind: "select",
    options: LEAD_STATUSES.map((status) => [status, LEAD_STATUS_LABELS[status]] as const),
    half: true,
  },
  { name: "valueCents", label: "Worth about", kind: "money", placeholder: "0.00", half: true },
  {
    name: "contact",
    label: "Contact",
    kind: "text",
    maxLength: 200,
    placeholder: "Phone or email",
  },
  {
    name: "source",
    label: "Came from",
    kind: "text",
    maxLength: 80,
    placeholder: "Like a referral",
  },
  {
    name: "nextStep",
    label: "Next step",
    kind: "text",
    maxLength: 200,
    placeholder: "Like Send a quote",
  },
  { name: "nextStepOn", label: "Next step by", kind: "date", half: true },
  { name: "notes", label: "Notes", kind: "textarea" },
];

const TONES = { danger: "text-danger", warn: "text-warn", muted: "text-muted" } as const;

/** Possible customers, from first contact to won or lost. */
export function LeadsView({ leads, today }: { leads: Lead[]; today: string }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const save = useSaveLead();
  const remove = useDeleteLead();
  const current = typeof editing === "number" ? leads.find((item) => item.id === editing) : null;
  const totals = leadTotals(leads);
  const closed = leads.filter((lead) => !OPEN_LEAD_STATUSES.includes(lead.status));

  const row = (lead: Lead) => {
    const open = OPEN_LEAD_STATUSES.includes(lead.status);
    const due = open && lead.nextStepOn ? describeDue(lead.nextStepOn, today) : null;
    const details = [lead.source, open ? lead.nextStep : ""].filter(Boolean).join(" · ");
    return (
      <li key={lead.id}>
        <Row
          title={lead.name}
          meta={
            due || details ? (
              <>
                {details}
                {due && details ? " · " : null}
                {due ? <span className={TONES[due.tone]}>{due.label}</span> : null}
              </>
            ) : undefined
          }
          value={lead.valueCents === null ? undefined : formatCents(lead.valueCents)}
          onOpen={() => setEditing(lead.id)}
        />
      </li>
    );
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Open leads" value={String(totals.open)} />
        <Stat
          label="Open value"
          value={formatCents(totals.openCents)}
          note="What open leads might be worth"
        />
        <Stat label="Won" value={formatCents(totals.wonCents)} />
      </div>
      <Panel
        title="Leads"
        description="People and companies who might hire you, and what to do next for each."
        action={
          <button type="button" className={primaryButton} onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" className="size-5" />
            Add lead
          </button>
        }
      >
        {leads.length === 0 ? (
          <p className="text-sm text-muted">No leads yet. Add anyone who's shown interest.</p>
        ) : (
          <div className="space-y-5">
            {OPEN_LEAD_STATUSES.map((status) => {
              const items = leads.filter((lead) => lead.status === status);
              return items.length === 0 ? null : (
                <Group key={status} title={LEAD_STATUS_LABELS[status]}>
                  {items.map(row)}
                </Group>
              );
            })}
            {closed.length > 0 ? (
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted">
                  Won and lost ({closed.length})
                </summary>
                <div className="mt-2 space-y-5">
                  {(["won", "lost"] as const).map((status) => {
                    const items = closed.filter((lead) => lead.status === status);
                    return items.length === 0 ? null : (
                      <Group key={status} title={LEAD_STATUS_LABELS[status]}>
                        {items.map(row)}
                      </Group>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </div>
        )}
      </Panel>

      {editing === "new" || current ? (
        <RecordSheet
          key={current?.id ?? "new"}
          open
          onClose={() => setEditing(null)}
          title={current ? "Lead" : "Add lead"}
          noun="lead"
          fields={FIELDS}
          initial={toFormValues(FIELDS, current ?? null)}
          isNew={!current}
          onSave={(values) =>
            save.mutateAsync({ id: current?.id ?? null, json: values as LeadCreate })
          }
          onDelete={current ? () => remove.mutateAsync(current.id) : undefined}
        />
      ) : null}
    </div>
  );
}
