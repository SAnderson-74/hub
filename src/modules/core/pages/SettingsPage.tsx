import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { StatusDot } from "../../../client/components/StatusDot";
import { inputClass, primaryButton } from "../../../client/components/ui";
import { formatHour } from "../../../client/lib/format";
import { useSaveSettings, useSettings, useSystem } from "../../../client/lib/queries";
import { applyAccent, previewAccent } from "../../../client/theme";
import { BASE_BACKGROUND, contrastRatio, isHexColor, readableTextOn } from "../../../shared/color";
import { ACCENT_PRESETS, settingsSchema } from "../../../shared/settings";
import { streakKey } from "../../education/queries";

function normalizeHex(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function AccentPicker({ saved }: { saved: string }) {
  const [draft, setDraft] = useState(saved);
  const [hexInput, setHexInput] = useState(saved);
  const [message, setMessage] = useState("");
  const save = useSaveSettings();
  const savedRef = useRef(saved);
  const dirty = draft !== saved;
  const isPreset = ACCENT_PRESETS.some((preset) => preset.hex === draft);
  const hexValid = isHexColor(normalizeHex(hexInput));

  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  // Preview the draft across the app; restore the saved color when leaving unsaved.
  useEffect(() => {
    previewAccent(draft);
  }, [draft]);
  useEffect(() => () => previewAccent(savedRef.current), []);

  const choose = (hex: string) => {
    setDraft(hex.toLowerCase());
    setHexInput(hex.toLowerCase());
    setMessage("");
  };

  const onHexChange = (value: string) => {
    setHexInput(value);
    const hex = normalizeHex(value);
    if (isHexColor(hex)) {
      setDraft(hex);
      setMessage("");
    }
  };

  const onSave = () => {
    save.mutate(
      { accentColor: draft },
      {
        onSuccess: (settings) => {
          applyAccent(settings.accentColor);
          setMessage("Accent saved");
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-muted">Presets</legend>
        <div className="flex flex-wrap gap-3">
          {ACCENT_PRESETS.map((preset) => (
            <label key={preset.hex} className="relative cursor-pointer">
              <input
                type="radio"
                name="accent-preset"
                value={preset.hex}
                checked={draft === preset.hex}
                onChange={() => choose(preset.hex)}
                className="peer absolute inset-0 z-10 size-full cursor-pointer appearance-none rounded-full opacity-0"
              />
              <span className="sr-only">{preset.name}</span>
              <span
                aria-hidden="true"
                title={preset.name}
                className="grid size-12 place-items-center rounded-full ring-offset-4 ring-offset-mantle transition-shadow peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text"
                style={{ backgroundColor: preset.hex }}
              >
                {draft === preset.hex ? (
                  <Check
                    className="size-5"
                    strokeWidth={3}
                    style={{ color: readableTextOn(preset.hex) }}
                  />
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-3 text-sm font-semibold text-muted">Custom</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={draft}
            onChange={(event) => choose(event.target.value)}
            aria-label="Pick a custom color"
            className="h-12 w-16 cursor-pointer rounded-control bg-transparent"
          />
          <input
            type="text"
            value={hexInput}
            onChange={(event) => onHexChange(event.target.value)}
            aria-label="Hex code"
            aria-invalid={!hexValid}
            maxLength={7}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            className="h-12 w-32 rounded-control bg-base px-4 font-semibold uppercase tabular-nums text-fg ring-1 ring-surface-1 focus-visible:ring-2 focus-visible:ring-accent-text focus-visible:outline-none aria-invalid:ring-danger"
          />
          {!isPreset && hexValid ? (
            <span className="text-sm text-muted">Custom color selected</span>
          ) : null}
        </div>
        {!hexValid ? (
          <p className="mt-2 text-sm text-danger">Use 6 hex digits, like #22d3ee.</p>
        ) : null}
        {contrastRatio(draft, BASE_BACKGROUND) < 4.5 ? (
          <p className="mt-2 text-sm text-warn">
            This color is dark against the background, so accent text is lightened to stay readable.
          </p>
        ) : null}
      </div>

      <div className="rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
        <p className="text-sm font-semibold text-muted">Preview</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
          <span className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-bold text-on-accent">
            Primary button
          </span>
          <span className="font-semibold text-accent-text">Highlighted text</span>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
            <StatusDot tone="accent" />
            Active item
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || save.isPending}
          className="h-12 rounded-full bg-accent px-6 font-bold text-on-accent transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {save.isPending ? "Saving…" : "Save accent"}
        </button>
        {dirty ? (
          <button
            type="button"
            onClick={() => choose(saved)}
            className="h-12 rounded-full px-4 font-semibold text-muted hover:bg-surface-0 hover:text-fg"
          >
            Undo changes
          </button>
        ) : null}
        <p role="status" className="text-sm font-semibold text-ok">
          {message}
        </p>
      </div>
      {save.isError ? (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      ) : null}
    </div>
  );
}

function StudyMinimum({ saved }: { saved: number }) {
  const [draft, setDraft] = useState(String(saved));
  const [message, setMessage] = useState("");
  const save = useSaveSettings();
  const queryClient = useQueryClient();
  const inputId = useId();
  const errorId = useId();
  const parsed = settingsSchema.shape.studyMinimumMinutes.safeParse(Number(draft.trim()));
  const problem =
    draft.trim() === ""
      ? "Enter the minutes as a number."
      : parsed.success
        ? null
        : (parsed.error.issues[0]?.message ?? "Enter the minutes as a number.");
  const dirty = parsed.success && parsed.data !== saved;

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    if (!parsed.success) return;
    save.mutate(
      { studyMinimumMinutes: parsed.data },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: streakKey });
          setMessage("Minimum saved");
        },
      },
    );
  };

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div>
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-muted">
          Minutes of study a day
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={5}
          max={720}
          step={1}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setMessage("");
          }}
          aria-invalid={problem !== null}
          aria-describedby={problem ? errorId : undefined}
          className={`${inputClass.replace("w-full", "w-32")} tabular-nums`}
        />
        {problem ? (
          <p id={errorId} className="mt-2 text-sm text-danger">
            {problem}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!dirty || save.isPending} className={primaryButton}>
          {save.isPending ? "Saving…" : "Save minimum"}
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
  );
}

export function SettingsPage() {
  const settings = useSettings();
  const system = useSystem();
  const info = system.data;

  const details: Array<[string, string]> = info
    ? [
        ["Version", info.version],
        ["Signed in as", info.user.login],
        ["Time zone", info.timeZone],
        [
          "Backups",
          `Nightly after ${formatHour(info.backups.scheduledHour)}, kept ${info.backups.keepDays} days`,
        ],
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Appearance, study streak, and details about this installation."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        <Panel
          title="Accent color"
          description="Used for highlights, active items, and buttons."
          className="lg:col-span-7"
        >
          {settings.data ? (
            <AccentPicker saved={settings.data.accentColor} />
          ) : settings.isError ? (
            <ErrorNote error={settings.error} onRetry={() => void settings.refetch()} />
          ) : (
            <LoadingRows rows={3} />
          )}
        </Panel>

        <Panel
          title="Study streak"
          description="Days with at least this much time logged on courses keep the streak going."
          className="lg:col-span-7 lg:row-start-2"
        >
          {settings.data ? (
            <StudyMinimum saved={settings.data.studyMinimumMinutes} />
          ) : settings.isError ? (
            <ErrorNote error={settings.error} onRetry={() => void settings.refetch()} />
          ) : (
            <LoadingRows rows={2} />
          )}
        </Panel>

        <Panel title="About" className="lg:col-span-5 lg:col-start-8 lg:row-start-1">
          {info ? (
            <dl className="divide-y divide-surface-0/70">
              {details.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="break-words font-semibold text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          ) : system.isError ? (
            <ErrorNote error={system.error} onRetry={() => void system.refetch()} />
          ) : (
            <LoadingRows />
          )}
        </Panel>
      </div>
    </>
  );
}
