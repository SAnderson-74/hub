import { Pencil, Trash2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  dangerButton,
  ghostButton,
  iconButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import {
  type ProjectItem,
  type Template,
  useDeleteTemplate,
  useRenameTemplate,
  useSaveTemplateFrom,
  useTemplates,
  useUseTemplate,
} from "../queries";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Reusable tasks and projects: use one, rename it, or delete it. */
export function TemplatesSheet({
  open,
  onClose,
  projects,
  defaultProjectId,
  today,
}: {
  open: boolean;
  onClose: () => void;
  projects: ProjectItem[];
  defaultProjectId: number | null;
  today: string;
}) {
  const templates = useTemplates(open);
  const [message, setMessage] = useState("");
  const list = templates.data ?? [];
  return (
    <Sheet
      open={open}
      onClose={() => {
        setMessage("");
        onClose();
      }}
      title="Templates"
      description="Reusable tasks and projects. Due dates count from the day you pick."
    >
      <p role="status" className={message ? "mb-4 text-sm font-semibold text-ok" : "sr-only"}>
        {message}
      </p>
      {!open ? null : templates.isPending ? (
        <LoadingRows rows={2} />
      ) : templates.isError ? (
        <ErrorNote error={templates.error} onRetry={() => void templates.refetch()} />
      ) : list.length === 0 ? (
        <p className="text-muted">
          No templates yet. Open a task or a project and choose “Save as template”. A task's
          subtasks come along as its checklist.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              projects={projects}
              defaultProjectId={defaultProjectId}
              today={today}
              onDone={setMessage}
            />
          ))}
        </ul>
      )}
    </Sheet>
  );
}

function TemplateRow({
  template,
  projects,
  defaultProjectId,
  today,
  onDone,
}: {
  template: Template;
  projects: ProjectItem[];
  defaultProjectId: number | null;
  today: string;
  onDone: (message: string) => void;
}) {
  const ids = useId();
  const [mode, setMode] = useState<"idle" | "use" | "rename" | "delete">("idle");
  const [date, setDate] = useState(today);
  const [projectId, setProjectId] = useState(
    defaultProjectId === null ? "" : String(defaultProjectId),
  );
  const [name, setName] = useState(template.name);
  const use = useUseTemplate();
  const rename = useRenameTemplate();
  const remove = useDeleteTemplate();
  const project = template.body.project;
  const error = use.error ?? rename.error ?? remove.error;

  const onUse = (event: FormEvent) => {
    event.preventDefault();
    use.mutate(
      {
        id: template.id,
        date,
        ...(project ? {} : { projectId: projectId === "" ? null : Number(projectId) }),
      },
      {
        onSuccess: (result) => {
          setMode("idle");
          onDone(
            project
              ? `Project “${project.name}” added with ${plural(result.taskIds.length, "task", "tasks")}.`
              : `${plural(result.taskIds.length, "task", "tasks")} added from “${template.name}”.`,
          );
        },
      },
    );
  };

  return (
    <li className="rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold break-words text-fg">{template.name}</p>
          <p className="text-sm text-muted">
            {project ? `New project “${project.name}”, ` : ""}
            {plural(template.taskCount, "task", "tasks")}
          </p>
        </div>
        <button
          type="button"
          className={iconButton}
          aria-label={`Rename ${template.name}`}
          onClick={() => setMode(mode === "rename" ? "idle" : "rename")}
        >
          <Pencil aria-hidden="true" className="size-5" />
        </button>
        <button
          type="button"
          className={iconButton}
          aria-label={`Delete ${template.name}`}
          onClick={() => setMode(mode === "delete" ? "idle" : "delete")}
        >
          <Trash2 aria-hidden="true" className="size-5" />
        </button>
      </div>

      {mode === "idle" ? (
        <button type="button" className={`${secondaryButton} mt-3`} onClick={() => setMode("use")}>
          Use template
        </button>
      ) : null}

      {mode === "use" ? (
        <form onSubmit={onUse} className="mt-3 space-y-3">
          <div>
            <label htmlFor={`${ids}-date`} className={labelClass}>
              Count due dates from
            </label>
            <input
              id={`${ids}-date`}
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
          {project ? null : (
            <div>
              <label htmlFor={`${ids}-project`} className={labelClass}>
                Add to
              </label>
              <select
                id={`${ids}-project`}
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className={inputClass}
              >
                <option value="">Inbox</option>
                {projects
                  .filter((item) => !item.archived)
                  .map((item) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryButton} disabled={!date || use.isPending}>
              {project ? "Add project" : "Add tasks"}
            </button>
            <button type="button" className={ghostButton} onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {mode === "rename" ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            rename.mutate(
              { id: template.id, name: name.trim() },
              {
                onSuccess: () => {
                  setMode("idle");
                  onDone("Template renamed.");
                },
              },
            );
          }}
        >
          <div className="min-w-0 flex-1">
            <label htmlFor={`${ids}-name`} className={labelClass}>
              Name
            </label>
            <input
              id={`${ids}-name`}
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            className={primaryButton}
            disabled={!name.trim() || rename.isPending}
          >
            Rename template
          </button>
        </form>
      ) : null}

      {mode === "delete" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-sm text-fg">Delete this template? Tasks made from it stay.</p>
          <button
            type="button"
            className={dangerButton}
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(template.id, { onSuccess: () => onDone("Template deleted.") })
            }
          >
            Delete template
          </button>
          <button type="button" className={ghostButton} onClick={() => setMode("idle")}>
            Keep it
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </li>
  );
}

/** "Save as template" for a task (with its subtasks) or a project (with its open tasks). */
export function SaveTemplate({
  from,
  defaultName,
}: {
  from: { taskId: number } | { projectId: number };
  defaultName: string;
}) {
  const ids = useId();
  const [name, setName] = useState(defaultName);
  const save = useSaveTemplateFrom();
  return (
    <details className="group rounded-tile bg-base/60 px-4 ring-1 ring-surface-0/50">
      <summary className="flex min-h-11 cursor-pointer list-none items-center font-semibold text-fg [&::-webkit-details-marker]:hidden">
        Save as template
      </summary>
      <form
        className="space-y-3 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ name: name.trim(), ...from });
        }}
      >
        <p className="text-sm text-muted">
          {"taskId" in from
            ? "Keeps the title, notes, priority, estimate, tags, and subtasks. Due dates are saved as days apart."
            : "Keeps the project's open tasks with their subtasks. Due dates are saved as days apart."}
        </p>
        <div>
          <label htmlFor={`${ids}-name`} className={labelClass}>
            Template name
          </label>
          <input
            id={`${ids}-name`}
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </div>
        <button type="submit" className={secondaryButton} disabled={!name.trim() || save.isPending}>
          Save template
        </button>
        <p role="status" className={save.isSuccess ? "text-sm font-semibold text-ok" : "sr-only"}>
          {save.isSuccess ? "Template saved. Use it from Templates on the Tasks page." : ""}
        </p>
        {save.isError ? (
          <p role="alert" className="text-sm text-danger">
            {save.error.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
