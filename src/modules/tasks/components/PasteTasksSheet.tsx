import { CircleCheck, Target } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  ghostButton,
  labelClass,
  primaryButton,
  textareaClass,
} from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { readPaste } from "../../../shared/claudeProject";
import {
  type TasksDocument,
  type TasksImportResult,
  tasksDocumentSchema,
} from "../../../shared/tasksImport";
import { formatShortDate, localDate } from "../dates";
import { useImportTasks } from "../queries";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Reads a Claude Project answer as tasks and goals, or says what's wrong. Null when empty. */
export function readPastedTasks(
  text: string,
): { document: TasksDocument } | { error: string } | null {
  const pasted = readPaste(text);
  if (!pasted) return null;
  if (!pasted.ok) return { error: pasted.error };
  if (pasted.format.format !== "hub-tasks/v1") {
    return {
      error: `That's ${pasted.format.noun} for ${pasted.format.into}, not tasks and goals. Paste it there, or in Settings > Imports > Paste from Claude.`,
    };
  }
  const parsed = tasksDocumentSchema.safeParse(pasted.data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: `It doesn't fit the format${issue ? `: ${issue.message}` : "."} Ask the Project again.`,
    };
  }
  return { document: pasted.data as TasksDocument };
}

/** What adding will do (or did), in a few words. */
function summary(result: TasksImportResult): string {
  const { tasks, subtasks, goals, milestones } = result.created;
  const parts = [
    tasks > 0
      ? `${count(tasks, "task", "tasks")}${subtasks > 0 ? ` with ${count(subtasks, "subtask", "subtasks")}` : ""}`
      : "",
    goals > 0
      ? `${count(goals, "goal", "goals")}${milestones > 0 ? ` with ${count(milestones, "milestone", "milestones")}` : ""}`
      : "",
    result.projectsCreated.length > 0
      ? count(result.projectsCreated.length, "new project", "new projects")
      : "",
  ].filter(Boolean);
  return parts.join(", ");
}

/** Projects, tasks, and goals read by a Claude Project, added at once. */
export function PasteTasksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Paste tasks"
      description="Projects, tasks, and goals from your Claude Project. Ones already open in Hub are skipped."
    >
      {open ? <PasteTasksForm onDone={onClose} /> : null}
    </Sheet>
  );
}

/** The paste, preview, and add; also used by the one paste box for every import. */
export function PasteTasksForm({
  initialText = "",
  onDone,
}: {
  initialText?: string;
  onDone: () => void;
}) {
  const ids = useId();
  const today = localDate(useNow());
  const [text, setText] = useState(initialText);
  const [preview, setPreview] = useState<TasksImportResult | null>(null);
  const [done, setDone] = useState<TasksImportResult | null>(null);
  const run = useImportTasks();
  const read = readPastedTasks(text);
  const document = read && "document" in read ? read.document : null;

  // The preview follows the paste, so what it shows is what adding will do.
  const key = JSON.stringify(document);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key covers the document
  useEffect(() => {
    if (!document) {
      setPreview(null);
      return;
    }
    run.mutate(
      { document, dryRun: true },
      { onSuccess: setPreview, onError: () => setPreview(null) },
    );
  }, [key]);

  if (done) {
    return (
      <div className="space-y-4">
        <p role="status" className="font-semibold text-ok">
          Added {summary(done) || "nothing new"}
        </p>
        <button type="button" className={primaryButton} onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  const adding = preview ? summary(preview) : "";
  const skipped = preview
    ? [...preview.tasks, ...preview.goals].filter((item) => item.outcome === "duplicate").length
    : 0;

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={`${ids}-paste`} className={labelClass}>
          Claude Project answer
        </label>
        <textarea
          id={`${ids}-paste`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={6}
          spellCheck={false}
          placeholder='{ "format": "hub-tasks/v1", "tasks": [ … ] }'
          aria-describedby={`${ids}-paste-hint`}
          className={`${textareaClass} font-mono text-sm`}
        />
        <p
          id={`${ids}-paste-hint`}
          className={`mt-1.5 text-sm ${read && "error" in read ? "text-danger" : "text-muted"}`}
        >
          {read && "error" in read ? read.error : "Nothing changes until you add them."}
        </p>
      </div>

      {run.error && !preview ? (
        <p role="alert" className="text-sm text-danger">
          {run.error.message}
        </p>
      ) : null}

      {preview ? (
        <div className={`space-y-4 ${run.isPending ? "opacity-60" : ""}`}>
          <p className="font-semibold text-fg">
            {adding ? `Adds ${adding}` : "Nothing new to add"}
            {skipped > 0
              ? `. ${count(skipped, "is", "are")} already in Hub and will be skipped.`
              : ""}
          </p>
          {preview.projectsCreated.length > 0 ? (
            <p className="text-sm text-muted">New projects: {preview.projectsCreated.join(", ")}</p>
          ) : null}
          <ul className="space-y-2">
            {preview.tasks.map((task, index) => (
              <PreviewRow
                // Titles can repeat, so their place tells them apart.
                // biome-ignore lint/suspicious/noArrayIndexKey: the list never reorders
                key={`task-${index}`}
                icon="task"
                title={task.title}
                detail={[
                  task.project ?? "Inbox",
                  task.dueDate ? `Due ${formatShortDate(task.dueDate, today)}` : "",
                  task.subtasks > 0 ? count(task.subtasks, "subtask", "subtasks") : "",
                ]}
                duplicate={task.outcome === "duplicate"}
                notices={task.notices}
              />
            ))}
            {preview.goals.map((goal, index) => (
              <PreviewRow
                // biome-ignore lint/suspicious/noArrayIndexKey: the list never reorders
                key={`goal-${index}`}
                icon="goal"
                title={goal.title}
                detail={[
                  "Goal",
                  goal.targetDate ? `By ${formatShortDate(goal.targetDate, today)}` : "",
                  goal.milestones > 0 ? count(goal.milestones, "milestone", "milestones") : "",
                ]}
                duplicate={goal.outcome === "duplicate"}
                notices={goal.notices}
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={run.isPending || !adding || !document}
              onClick={() => {
                if (document) run.mutate({ document, dryRun: false }, { onSuccess: setDone });
              }}
            >
              {adding ? "Add them" : "Nothing to add"}
            </button>
            <button type="button" className={ghostButton} onClick={onDone}>
              Cancel
            </button>
          </div>
          {run.error ? (
            <p role="alert" className="text-sm text-danger">
              {run.error.message}
            </p>
          ) : null}
        </div>
      ) : document && run.isPending ? (
        <p className="text-sm text-muted">Checking…</p>
      ) : null}
    </div>
  );
}

function PreviewRow({
  icon,
  title,
  detail,
  duplicate,
  notices,
}: {
  icon: "task" | "goal";
  title: string;
  detail: string[];
  duplicate: boolean;
  notices: string[];
}) {
  const Icon = icon === "goal" ? Target : CircleCheck;
  return (
    <li className="rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <span className="flex items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted" />
        <span className="min-w-0">
          <span className="block font-semibold break-words text-fg">{title}</span>
          <span className="block text-sm text-muted">{detail.filter(Boolean).join(" · ")}</span>
          <span
            className={`block text-sm font-semibold ${duplicate ? "text-muted" : notices.length > 0 ? "text-warn" : "text-ok"}`}
          >
            {duplicate ? "Already in Hub, so it's skipped" : "Adds it"}
          </span>
          {!duplicate && notices.length > 0 ? (
            <span className="block text-sm text-warn">{notices.join(" ")}</span>
          ) : null}
        </span>
      </span>
    </li>
  );
}
