import { Plus } from "lucide-react";
import { useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { primaryButton } from "../../../client/components/ui";
import type { NoteCreate } from "../../../shared/business";
import { formatShortDate, localDate } from "../../tasks/dates";
import { type Note, useDeleteNote, useSaveNote } from "../queries";
import { type FieldSpec, RecordSheet, toFormValues } from "./RecordSheet";
import { Row } from "./Row";

const FIELDS: FieldSpec[] = [
  {
    name: "title",
    label: "Title",
    kind: "text",
    maxLength: 120,
    required: "Give the note a title.",
  },
  { name: "body", label: "Note", kind: "textarea", rows: 10 },
  { name: "pinned", label: "Pin to the top", kind: "checkbox" },
];

/** The first line of a note, for the list. */
const firstLine = (body: string) => body.trim().split("\n")[0] ?? "";

/** Free-form notes: names to consider, pricing ideas, contacts to follow up. */
export function NotesView({ notes, today }: { notes: Note[]; today: string }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const save = useSaveNote();
  const remove = useDeleteNote();
  const current = typeof editing === "number" ? notes.find((item) => item.id === editing) : null;

  return (
    <Panel
      title="Notes"
      description="Ideas and details that don't fit anywhere else."
      action={
        <button type="button" className={primaryButton} onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" className="size-5" />
          Add note
        </button>
      }
    >
      {notes.length === 0 ? (
        <p className="text-sm text-muted">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id}>
              <Row
                title={note.pinned ? `${note.title} (pinned)` : note.title}
                meta={
                  <>
                    <span className="block truncate">{firstLine(note.body)}</span>
                    <span className="block text-faint">
                      Changed {formatShortDate(localDate(new Date(note.updatedAt)), today)}
                    </span>
                  </>
                }
                onOpen={() => setEditing(note.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {editing === "new" || current ? (
        <RecordSheet
          key={current?.id ?? "new"}
          open
          onClose={() => setEditing(null)}
          title={current ? "Note" : "Add note"}
          noun="note"
          fields={FIELDS}
          initial={toFormValues(FIELDS, current ?? null)}
          isNew={!current}
          onSave={(values) =>
            save.mutateAsync({ id: current?.id ?? null, json: values as NoteCreate })
          }
          onDelete={current ? () => remove.mutateAsync(current.id) : undefined}
        />
      ) : null}
    </Panel>
  );
}
