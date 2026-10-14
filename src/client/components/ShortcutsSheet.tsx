import { menuKeyLabel } from "../lib/commands";
import type { AppPage } from "../pages";
import { Sheet } from "./Sheet";

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((key, index) => (
        <span key={key} className="flex items-center gap-1">
          {index > 0 ? <span className="text-sm text-muted">then</span> : null}
          <kbd className="min-w-7 rounded-control bg-base px-2 py-1 text-center font-sans text-sm text-fg ring-1 ring-surface-1">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}

/** Every keyboard shortcut. They work anywhere except while typing in a field. */
export function ShortcutsSheet({
  open,
  onClose,
  pages,
}: {
  open: boolean;
  onClose: () => void;
  pages: AppPage[];
}) {
  const platform = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const rows: Array<[string[], string]> = [
    [[menuKeyLabel(platform)], "Search and commands"],
    [["/"], "Search"],
    [["?"], "This list"],
    [["Esc"], "Close a sheet or the menu"],
    ...pages.map((page): [string[], string] => [
      ["G", page.key.toUpperCase()],
      `Go to ${page.label}`,
    ]),
  ];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="dialog"
      title="Keyboard shortcuts"
      description="They work anywhere except while typing in a field."
    >
      <dl className="divide-y divide-surface-0">
        {rows.map(([keys, label]) => (
          <div key={label} className="flex min-h-11 items-center justify-between gap-4 py-1.5">
            <dt className="text-fg">{label}</dt>
            <dd>
              <Keys keys={keys} />
            </dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
