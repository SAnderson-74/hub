import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  dangerButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { PROJECT_KIND_LABELS, PROJECT_KINDS, type ProjectKind } from "../../../shared/tasks";
import { type ProjectItem, useCreateProject, useDeleteProject, useUpdateProject } from "../queries";

type ProjectSheetProps = {
  /** "new" to create a project, a project to edit it, or null when closed. */
  target: "new" | ProjectItem | null;
  onClose: () => void;
  onCreated: (project: ProjectItem) => void;
  onDeleted: () => void;
};

export function ProjectSheet({ target, onClose, onCreated, onDeleted }: ProjectSheetProps) {
  const editing = target !== null && target !== "new" ? target : null;
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      variant="dialog"
      title={editing ? "Edit project" : "New project"}
      description={editing ? undefined : "Group related tasks, like a course or a repair."}
    >
      {target === null ? null : (
        <ProjectForm
          key={editing?.id ?? "new"}
          project={editing}
          onClose={onClose}
          onCreated={onCreated}
          onDeleted={onDeleted}
        />
      )}
    </Sheet>
  );
}

function ProjectForm({
  project,
  onClose,
  onCreated,
  onDeleted,
}: {
  project: ProjectItem | null;
  onClose: () => void;
  onCreated: (project: ProjectItem) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [kind, setKind] = useState<ProjectKind>(project?.kind ?? "general");
  const [tried, setTried] = useState(false);
  const create = useCreateProject();
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const ids = useId();
  const nameMissing = name.trim() === "";
  const busy = create.isPending || update.isPending || remove.isPending;
  const error = create.error ?? update.error ?? remove.error;
  const taskCount = project ? project.openTaskCount + project.doneTaskCount : 0;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (nameMissing) return;
    if (project) {
      update.mutate({ id: project.id, patch: { name: name.trim(), kind } }, { onSuccess: onClose });
    } else {
      create.mutate({ name: name.trim(), kind }, { onSuccess: onCreated });
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor={`${ids}-name`} className={labelClass}>
            Name
          </label>
          <input
            id={`${ids}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            aria-invalid={tried && nameMissing}
            aria-describedby={tried && nameMissing ? `${ids}-name-error` : undefined}
            className={inputClass}
          />
          {tried && nameMissing ? (
            <p id={`${ids}-name-error`} className="mt-1.5 text-sm text-danger">
              Give the project a name.
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor={`${ids}-kind`} className={labelClass}>
            Kind
          </label>
          <select
            id={`${ids}-kind`}
            value={kind}
            onChange={(event) => setKind(event.target.value as ProjectKind)}
            className={inputClass}
          >
            {PROJECT_KINDS.map((value) => (
              <option key={value} value={value}>
                {PROJECT_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={primaryButton} disabled={busy}>
          {project ? "Save project" : "Create project"}
        </button>
      </form>

      {project ? (
        <div className="space-y-3 border-t border-surface-0/70 pt-5">
          <button
            type="button"
            className={secondaryButton}
            disabled={busy}
            onClick={() =>
              update.mutate(
                { id: project.id, patch: { archived: !project.archived } },
                { onSuccess: onClose },
              )
            }
          >
            {project.archived ? "Restore project" : "Archive project"}
          </button>
          <p className="text-sm text-muted">
            {project.archived
              ? "Restoring puts it back in the project list."
              : "Archived projects keep their tasks but leave the project list."}
          </p>
          {taskCount === 0 ? (
            <button
              type="button"
              className={`${dangerButton} -ml-4`}
              disabled={busy}
              onClick={() => remove.mutate(project.id, { onSuccess: onDeleted })}
            >
              Delete project
            </button>
          ) : (
            <p className="text-sm text-muted">
              To delete this project, move or delete its tasks first.
            </p>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
