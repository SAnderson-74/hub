import { labelClass } from "./ui";

export type CheckOption = { value: string; label: string; group?: string };

/** Several choices at once, as checkboxes grouped under headings, each a 44px target. */
export function CheckList({
  label,
  options,
  picked,
  onChange,
}: {
  label: string;
  options: CheckOption[];
  picked: string[];
  onChange: (picked: string[]) => void;
}) {
  const groups = [...new Set(options.map((option) => option.group ?? ""))];
  const toggle = (value: string) =>
    onChange(picked.includes(value) ? picked.filter((item) => item !== value) : [...picked, value]);
  return (
    <fieldset className="min-w-0">
      <legend className={labelClass}>{label}</legend>
      <div className="max-h-64 overflow-y-auto rounded-control bg-base px-3 ring-1 ring-surface-1">
        {groups.map((group) => (
          <div key={group || "all"}>
            {group ? <p className="pt-3 text-sm font-semibold text-muted">{group}</p> : null}
            {options
              .filter((option) => (option.group ?? "") === group)
              .map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-11 cursor-pointer items-center gap-3"
                >
                  <input
                    type="checkbox"
                    checked={picked.includes(option.value)}
                    onChange={() => toggle(option.value)}
                    className="size-5 shrink-0 accent-accent"
                  />
                  <span className="min-w-0 break-words text-fg">{option.label}</span>
                </label>
              ))}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
