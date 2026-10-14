import { ChevronDown, ChevronUp } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ghostButton, primaryButton } from "../../../client/components/ui";
import { useSaveSettings } from "../../../client/lib/queries";
import {
  HOME_WIDGET_IDS,
  HOME_WIDGETS,
  type HomeWidgetId,
  type HomeWidgetSettings,
  orderedWidgets,
  widgetModule,
} from "../../../shared/homeWidgets";
import { MODULES, type ModuleSettings } from "../../../shared/modules";

const widgetOf = (id: HomeWidgetId) => HOME_WIDGETS.find((widget) => widget.id === id);
const moduleLabel = (id: HomeWidgetId) => {
  const module = widgetModule(id);
  return MODULES.find((item) => item.id === module)?.label;
};

/** Which widgets Home shows and in what order. */
export function HomeWidgetsPanel({
  saved,
  modules,
}: {
  saved: HomeWidgetSettings;
  modules: ModuleSettings;
}) {
  const save = useSaveSettings();
  const [order, setOrder] = useState(() => orderedWidgets(saved));
  const [hidden, setHidden] = useState(() => new Set(saved.hidden));
  const [message, setMessage] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const savedHidden = new Set(saved.hidden);
  const dirty =
    order.join() !== orderedWidgets(saved).join() ||
    hidden.size !== savedHidden.size ||
    [...hidden].some((id) => !savedHidden.has(id));

  const move = (index: number, step: -1 | 1) => {
    const next = [...order];
    const [id] = next.splice(index, 1);
    if (!id) return;
    next.splice(index + step, 0, id);
    setOrder(next);
    setMessage("");
    setAnnouncement(`${widgetOf(id)?.label} moved ${step < 0 ? "up" : "down"}.`);
  };
  const toggle = (id: HomeWidgetId, shown: boolean) => {
    const next = new Set(hidden);
    if (shown) next.delete(id);
    else next.add(id);
    setHidden(next);
    setMessage("");
  };

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      { homeWidgets: { order, hidden: order.filter((id) => hidden.has(id)) } },
      { onSuccess: () => setMessage("Home saved") },
    );
  };

  return (
    <form onSubmit={onSave} className="space-y-4">
      <ul className="space-y-2">
        {order.map((id, index) => {
          const widget = widgetOf(id);
          if (!widget) return null;
          const module = widgetModule(id);
          const off = module !== undefined && !modules[module];
          return (
            <li
              key={id}
              className="flex items-center gap-1 rounded-tile bg-base/80 py-1 pr-1 pl-4 ring-1 ring-surface-0/50"
            >
              <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5">
                <input
                  type="checkbox"
                  checked={!hidden.has(id)}
                  onChange={(event) => toggle(id, event.target.checked)}
                  className="size-5 shrink-0 accent-accent"
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-fg">{widget.label}</span>
                  <span className="block text-sm text-muted">
                    {off ? `Hidden while ${moduleLabel(id)} is off.` : widget.description}
                  </span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${widget.label} up`}
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-0 hover:text-fg disabled:opacity-30"
              >
                <ChevronUp aria-hidden="true" className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === order.length - 1}
                aria-label={`Move ${widget.label} down`}
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-0 hover:text-fg disabled:opacity-30"
              >
                <ChevronDown aria-hidden="true" className="size-5" />
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={primaryButton} disabled={!dirty || save.isPending}>
          {save.isPending ? "Saving…" : "Save Home"}
        </button>
        <button
          type="button"
          className={ghostButton}
          onClick={() => {
            setOrder([...HOME_WIDGET_IDS]);
            setHidden(new Set());
            setMessage("");
          }}
        >
          Use the usual order
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
