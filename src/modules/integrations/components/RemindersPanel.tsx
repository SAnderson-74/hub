import { type FormEvent, useId, useState } from "react";
import { LoadingRows } from "../../../client/components/States";
import { inputClass, primaryButton, secondaryButton } from "../../../client/components/ui";
import { useSaveSettings } from "../../../client/lib/queries";
import {
  DUE_SOON_DAYS,
  type DueSoonDays,
  formatTime,
  REMINDER_LABELS,
  type ReminderKind,
  type ReminderSettings,
  remindersSchema,
  TITHING_REPEAT_DAYS,
  type TithingReminderSettings,
  tithingReminderSchema,
} from "../../../shared/reminders";
import { useReminders, useSendReminderNow } from "../queries";

const HINTS: Record<ReminderKind, string> = {
  digest:
    "Today's tasks, what's due in the next few days, and your study streak. Skipped on a quiet day.",
  due_soon:
    "Tasks, goals, milestones, assessments, bills, business steps, and lead follow-ups coming due. Each one once.",
  streak: "When you have a study streak and haven't met today's minimum yet.",
  tithing: `When income comes in with tithing to pay, and every ${TITHING_REPEAT_DAYS} days while some is unpaid.`,
};

const SETTING_KEYS: Record<Exclude<ReminderKind, "tithing">, keyof ReminderSettings> = {
  digest: "digest",
  due_soon: "dueSoon",
  streak: "streak",
};

const daysLabel = (days: DueSoonDays) =>
  days === 0 ? "Today only" : days === 1 ? "Today and tomorrow" : `The next ${days} days`;

const sentLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** When each reminder goes out, what it would say now, and the latest sent. */
export function RemindersPanel({
  saved,
  savedTithing,
  tithingOn,
  configured,
}: {
  saved: ReminderSettings;
  savedTithing: TithingReminderSettings;
  /** Whether the Tithing module is on; its reminder shows only then. */
  tithingOn: boolean;
  /** Whether the reminder webhook address is set. */
  configured: boolean;
}) {
  const ids = useId();
  const save = useSaveSettings();
  const overview = useReminders();
  const sendNow = useSendReminderNow();
  const [draft, setDraft] = useState(saved);
  const [tithing, setTithing] = useState(savedTithing);
  const [message, setMessage] = useState("");
  const parsed = remindersSchema.safeParse(draft);
  const tithingParsed = tithingReminderSchema.safeParse(tithing);
  const valid = parsed.success && tithingParsed.success;
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved) ||
    JSON.stringify(tithing) !== JSON.stringify(savedTithing);
  const kinds: ReminderKind[] = tithingOn
    ? ["digest", "due_soon", "streak", "tithing"]
    : ["digest", "due_soon", "streak"];
  /** A reminder's on/off and time, from the draft or the saved settings. */
  const partOf = (kind: ReminderKind, from: "draft" | "saved") =>
    kind === "tithing"
      ? from === "draft"
        ? tithing
        : savedTithing
      : (from === "draft" ? draft : saved)[SETTING_KEYS[kind]];

  const setPart = (kind: ReminderKind, value: { enabled?: boolean; time?: string }) => {
    if (kind === "tithing") setTithing((current) => ({ ...current, ...value }));
    else {
      const key = SETTING_KEYS[kind];
      setDraft((current) => ({ ...current, [key]: { ...current[key], ...value } }));
    }
    setMessage("");
  };

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    if (!parsed.success || !tithingParsed.success) return;
    save.mutate(
      { reminders: parsed.data, tithingReminder: tithingParsed.data },
      {
        onSuccess: () => {
          setMessage("Reminders saved");
          void overview.refetch();
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      {!configured ? (
        <p className="rounded-tile bg-base/80 p-4 text-sm text-fg ring-1 ring-surface-0/50">
          Reminders go out as notifications on devices that turn them on (Notifications, below), or
          through Home Assistant's reminder webhook. Until one is set up, you can see what they'd
          say below.
        </p>
      ) : null}

      <form onSubmit={onSave} noValidate className="space-y-4">
        {kinds.map((kind) => {
          const part = partOf(kind, "draft");
          const id = `${ids}-${kind}`;
          return (
            <fieldset
              key={kind}
              className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
            >
              <legend className="sr-only">{REMINDER_LABELS[kind]}</legend>
              <label className="flex min-h-11 items-center gap-3 font-semibold text-fg">
                <input
                  type="checkbox"
                  checked={part.enabled}
                  onChange={(event) => setPart(kind, { enabled: event.target.checked })}
                  aria-describedby={`${id}-hint`}
                  className="size-5 accent-accent"
                />
                {REMINDER_LABELS[kind]}
              </label>
              <p id={`${id}-hint`} className="text-sm text-muted">
                {HINTS[kind]}
              </p>
              <div className="flex flex-wrap gap-3">
                <div>
                  <label
                    htmlFor={`${id}-time`}
                    className="mb-1.5 block text-sm font-semibold text-muted"
                  >
                    At
                  </label>
                  <input
                    id={`${id}-time`}
                    type="time"
                    value={part.time}
                    disabled={!part.enabled}
                    onChange={(event) => setPart(kind, { time: event.target.value })}
                    className={`${inputClass} w-36`}
                  />
                </div>
                {kind === "due_soon" ? (
                  <div>
                    <label
                      htmlFor={`${id}-days`}
                      className="mb-1.5 block text-sm font-semibold text-muted"
                    >
                      Looking at
                    </label>
                    <select
                      id={`${id}-days`}
                      value={draft.dueSoon.days}
                      disabled={!part.enabled}
                      onChange={(event) => {
                        const days = Number(event.target.value) as DueSoonDays;
                        setDraft((current) => ({
                          ...current,
                          dueSoon: { ...current.dueSoon, days },
                        }));
                        setMessage("");
                      }}
                      className={`${inputClass} w-52`}
                    >
                      {DUE_SOON_DAYS.map((days) => (
                        <option key={days} value={days}>
                          {daysLabel(days)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            </fieldset>
          );
        })}
        <p className="text-sm text-muted">
          Times are in Hub's time zone. A reminder Hub couldn't send on time still goes out up to
          three hours later.
        </p>
        {!valid ? (
          <p role="alert" className="text-sm text-danger">
            {(parsed.error ?? tithingParsed.error)?.issues[0]?.message}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!dirty || !valid || save.isPending}
            className={primaryButton}
          >
            {save.isPending ? "Saving…" : "Save reminders"}
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

      <section
        aria-labelledby={`${ids}-now`}
        className="space-y-3 border-t border-surface-0/70 pt-4"
      >
        <h3 id={`${ids}-now`} className="font-semibold text-fg">
          What they'd say now
        </h3>
        {overview.isPending ? (
          <LoadingRows rows={3} />
        ) : overview.isError ? (
          <p role="alert" className="text-sm text-danger">
            {overview.error.message}
          </p>
        ) : (
          <ul className="space-y-3">
            {overview.data.previews.map((preview) => (
              <li key={preview.kind} className="space-y-2">
                <p className="text-sm font-semibold text-muted">
                  {REMINDER_LABELS[preview.kind]}
                  {preview.sentToday ? " · Sent today" : ""}
                  {partOf(preview.kind, "saved").enabled
                    ? ` · ${formatTime(partOf(preview.kind, "saved").time)}`
                    : " · Off"}
                </p>
                {preview.reminder ? (
                  <div className="rounded-tile bg-base px-3 py-2 text-sm ring-1 ring-surface-0/50">
                    <p className="font-semibold text-fg">{preview.reminder.title}</p>
                    <p className="text-muted">{preview.reminder.message}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">Nothing to send right now.</p>
                )}
                {configured && preview.reminder ? (
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={sendNow.isPending}
                    onClick={() =>
                      sendNow.mutate(preview.kind, {
                        onSuccess: () =>
                          setMessage(`${REMINDER_LABELS[preview.kind]} sent to Home Assistant`),
                      })
                    }
                  >
                    Send now
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {sendNow.isError ? (
          <p role="alert" className="text-sm text-danger">
            {sendNow.error.message}
          </p>
        ) : null}
      </section>

      {overview.data && overview.data.recent.length > 0 ? (
        <section
          aria-labelledby={`${ids}-recent`}
          className="space-y-2 border-t border-surface-0/70 pt-4"
        >
          <h3 id={`${ids}-recent`} className="font-semibold text-fg">
            Recently sent
          </h3>
          <ul className="divide-y divide-surface-0 text-sm">
            {overview.data.recent.map((entry) => (
              <li key={`${entry.sentAt}-${entry.kind}`} className="py-2">
                <p className="font-semibold break-words text-fg">{entry.title}</p>
                <p className="text-muted">
                  {REMINDER_LABELS[entry.kind]} · {sentLabel(entry.sentAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
