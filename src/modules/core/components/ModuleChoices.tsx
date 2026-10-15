import { MODULES, type ModuleId, type ModuleSettings } from "../../../shared/modules";

/** A checkbox card per module, for setup and Settings. */
export function ModuleChoices({
  value,
  onChange,
  legend,
}: {
  value: ModuleSettings;
  onChange: (next: ModuleSettings) => void;
  legend: string;
}) {
  const toggle = (id: ModuleId, on: boolean) => onChange({ ...value, [id]: on });
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold text-muted">{legend}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {MODULES.map((module) => (
          <label
            key={module.id}
            className="flex min-h-16 cursor-pointer items-start gap-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50 has-checked:ring-accent-text/60 has-focus-visible:ring-2 has-focus-visible:ring-accent-text"
          >
            <input
              type="checkbox"
              checked={value[module.id]}
              onChange={(event) => toggle(module.id, event.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-accent"
            />
            <span className="min-w-0">
              <span className="block font-semibold text-fg">{module.label}</span>
              <span className="block text-sm text-muted">{module.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
