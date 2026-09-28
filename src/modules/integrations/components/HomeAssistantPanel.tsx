import { type FormEvent, useId, useState } from "react";
import { LoadingRows } from "../../../client/components/States";
import { inputClass, primaryButton, secondaryButton } from "../../../client/components/ui";
import { useSaveSettings } from "../../../client/lib/queries";
import {
  type HomeAssistantSettings,
  homeAssistantSchema,
  SUMMARY_INTERVALS,
  type SummaryInterval,
} from "../../../shared/homeAssistant";
import {
  useHomeAssistantStatus,
  useSendSummary,
  useSendTestReminder,
  useSummaryPreview,
} from "../queries";

type Delivery = { at: string; ok: boolean; detail: string };

/** "Last sent 3:15 PM: Sent. Home Assistant answered 200." */
function lastLine(configured: boolean, last: Delivery | null): { text: string; ok: boolean } {
  if (!configured) return { text: "Off. Add a webhook address to turn it on.", ok: true };
  if (!last) return { text: "Not sent since Hub last started.", ok: true };
  const when = new Date(last.at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return { text: `${last.ok ? "Last sent" : "Last try"} ${when}: ${last.detail}`, ok: last.ok };
}

/** Webhook addresses for the summary and reminders, and sending either one now. */
export function HomeAssistantPanel({ saved }: { saved: HomeAssistantSettings }) {
  const ids = useId();
  const save = useSaveSettings();
  const status = useHomeAssistantStatus();
  const sendSummary = useSendSummary();
  const sendReminder = useSendTestReminder();
  const [draft, setDraft] = useState(saved);
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const preview = useSummaryPreview(previewing);
  const parsed = homeAssistantSchema.safeParse(draft);
  const problem = (field: "summaryUrl" | "reminderUrl") =>
    parsed.success
      ? null
      : (parsed.error.issues.find((issue) => issue.path[0] === field)?.message ?? null);
  const dirty =
    draft.summaryUrl !== saved.summaryUrl ||
    draft.reminderUrl !== saved.reminderUrl ||
    draft.summaryMinutes !== saved.summaryMinutes;

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    setMessage("");
    if (!parsed.success) return;
    save.mutate(
      { homeAssistant: parsed.data },
      {
        onSuccess: () => {
          setMessage("Home Assistant saved");
          void status.refetch();
        },
      },
    );
  };

  const urlField = (field: "summaryUrl" | "reminderUrl", label: string, hint: string) => {
    const id = `${ids}-${field}`;
    const shown = tried ? problem(field) : null;
    return (
      <div>
        <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-muted">
          {label}
        </label>
        <input
          id={id}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={draft[field]}
          onChange={(event) => {
            setDraft((current) => ({ ...current, [field]: event.target.value }));
            setMessage("");
          }}
          placeholder="http://192.0.2.10:8123/api/webhook/…"
          aria-invalid={shown ? true : undefined}
          aria-describedby={`${id}-note`}
          className={inputClass}
        />
        <p id={`${id}-note`} className={`mt-1.5 text-sm ${shown ? "text-danger" : "text-muted"}`}>
          {shown ?? hint}
        </p>
      </div>
    );
  };

  const summaryState = status.data
    ? lastLine(status.data.summary.configured, status.data.summary.last)
    : null;
  const reminderState = status.data
    ? lastLine(status.data.reminder.configured, status.data.reminder.last)
    : null;
  // A failed send already shows in its line below; only other errors need their own.
  const shownDetails = [status.data?.summary.last?.detail, status.data?.reminder.last?.detail];
  const failure = sendSummary.error ?? sendReminder.error;
  const sendError = failure && !shownDetails.includes(failure.message) ? failure : null;

  return (
    <div className="space-y-6">
      <form onSubmit={onSave} noValidate className="space-y-4">
        {urlField(
          "summaryUrl",
          "Summary webhook",
          "Gets the study streak, today's tasks, and upcoming dates. Leave it empty to turn it off.",
        )}
        <div>
          <label htmlFor={`${ids}-every`} className="mb-1.5 block text-sm font-semibold text-muted">
            Send the summary every
          </label>
          <select
            id={`${ids}-every`}
            value={draft.summaryMinutes}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                summaryMinutes: Number(event.target.value) as SummaryInterval,
              }));
              setMessage("");
            }}
            className={`${inputClass} sm:w-48`}
          >
            {SUMMARY_INTERVALS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 60 ? "Hour" : `${minutes} minutes`}
              </option>
            ))}
          </select>
        </div>
        {urlField(
          "reminderUrl",
          "Reminder webhook",
          "Gets reminders, for Home Assistant to send to your phone. Leave it empty to turn it off.",
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!dirty || save.isPending} className={primaryButton}>
            {save.isPending ? "Saving…" : "Save Home Assistant"}
          </button>
          <p role="status" className="text-sm font-semibold text-ok">
            {message}
          </p>
        </div>
        {save.isError ? (
          <p role="alert" className="text-sm text-danger">
            {save.error.message}
          </p>
        ) : null}
      </form>

      <div className="space-y-4 border-t border-surface-0/70 pt-4">
        {status.isPending ? (
          <LoadingRows rows={2} />
        ) : (
          <>
            <div className="space-y-2">
              <p
                aria-live="polite"
                className={`text-sm ${summaryState?.ok === false ? "text-danger" : "text-muted"}`}
              >
                <span className="font-semibold text-fg">Summary: </span>
                {summaryState?.text}
              </p>
              <button
                type="button"
                className={secondaryButton}
                disabled={!status.data?.summary.configured || dirty || sendSummary.isPending}
                onClick={() => sendSummary.mutate()}
              >
                {sendSummary.isPending ? "Sending…" : "Send summary now"}
              </button>
            </div>
            <div className="space-y-2">
              <p
                aria-live="polite"
                className={`text-sm ${reminderState?.ok === false ? "text-danger" : "text-muted"}`}
              >
                <span className="font-semibold text-fg">Reminders: </span>
                {reminderState?.text}
              </p>
              <button
                type="button"
                className={secondaryButton}
                disabled={!status.data?.reminder.configured || dirty || sendReminder.isPending}
                onClick={() => sendReminder.mutate()}
              >
                {sendReminder.isPending ? "Sending…" : "Send a test reminder"}
              </button>
            </div>
            {dirty ? <p className="text-sm text-muted">Save your changes before sending.</p> : null}
            {sendError ? (
              <p role="alert" className="text-sm text-danger">
                {sendError.message}
              </p>
            ) : null}
          </>
        )}
      </div>

      <details
        className="border-t border-surface-0/70 pt-2 text-sm"
        onToggle={(event) => setPreviewing(event.currentTarget.open)}
      >
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-fg">
          See what the summary sends
        </summary>
        <p className="mb-2 text-muted">
          Home Assistant templates read these fields from trigger.json. docs/SETUP.md has examples.
        </p>
        {preview.isPending ? (
          <LoadingRows rows={2} />
        ) : preview.isError ? (
          <p role="alert" className="text-danger">
            {preview.error.message}
          </p>
        ) : (
          <pre className="max-h-80 overflow-auto rounded-tile bg-base p-3 text-xs leading-relaxed text-fg ring-1 ring-surface-0/50">
            {JSON.stringify(preview.data, null, 2)}
          </pre>
        )}
      </details>
    </div>
  );
}
