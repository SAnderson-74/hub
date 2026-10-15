import { z } from "zod";
import type { ModuleId, ModuleSettings } from "./modules";

// What Home can show. Settings keeps the order and which are hidden; a widget whose
// module is off never shows. A widget added after the order was saved shows at the
// end until it's moved, so new widgets aren't missed.

export const HOME_WIDGETS = [
  { id: "today", label: "Today", description: "Tasks due today or in progress", module: "tasks" },
  {
    id: "milestones",
    label: "Next milestones",
    description: "The soonest steps toward goals",
    module: "goals",
  },
  {
    id: "money",
    label: "Money this month",
    description: "Left to spend, spent, and money in",
    module: "money",
  },
  { id: "tithing", label: "Tithing", description: "Unpaid or paid up", module: "tithing" },
  { id: "streak", label: "Study streak", description: "Days in a row", module: "courses" },
  {
    id: "habits",
    label: "Habits",
    description: "What's on today, with check-offs",
    module: "habits",
  },
  { id: "term", label: "Term progress", description: "Credits and pacing", module: "courses" },
  {
    id: "time",
    label: "Time today",
    description: "Time logged and running timers",
    module: "time",
  },
  {
    id: "resale",
    label: "Resale stock",
    description: "What's in stock and listings that have sat",
    module: "resale",
  },
  {
    id: "business",
    label: "Business follow-ups",
    description: "Lead follow-ups and steps due soon",
    module: "business",
  },
  { id: "system", label: "System", description: "Backups, sign-in, and the database" },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  module?: ModuleId;
}>;

export type HomeWidgetId = (typeof HOME_WIDGETS)[number]["id"];
export const HOME_WIDGET_IDS = HOME_WIDGETS.map((widget) => widget.id) as HomeWidgetId[];

const isWidget = (id: string): id is HomeWidgetId => (HOME_WIDGET_IDS as string[]).includes(id);

/**
 * The saved arrangement. Ids are checked when read, not here, so a widget a later
 * build removes (or an older build doesn't know) is skipped instead of resetting the
 * whole arrangement.
 */
export const homeWidgetsSchema = z
  .object({
    order: z.array(z.string().max(40)).max(50),
    hidden: z.array(z.string().max(40)).max(50),
  })
  .strict();
export type HomeWidgetSettings = z.infer<typeof homeWidgetsSchema>;

export const defaultHomeWidgets: HomeWidgetSettings = { order: [], hidden: [] };

/** Every widget in its saved order, with ones not in the saved order at the end. */
export function orderedWidgets(saved: HomeWidgetSettings): HomeWidgetId[] {
  const order = [...new Set(saved.order.filter(isWidget))];
  return [...order, ...HOME_WIDGET_IDS.filter((id) => !order.includes(id))];
}

/** The widget's module, if it has one. */
export function widgetModule(id: HomeWidgetId): ModuleId | undefined {
  const widget = HOME_WIDGETS.find((item) => item.id === id);
  return widget && "module" in widget ? widget.module : undefined;
}

/** The widgets Home shows, in order: not hidden, and their module on. */
export function visibleWidgets(saved: HomeWidgetSettings, modules: ModuleSettings): HomeWidgetId[] {
  return orderedWidgets(saved).filter((id) => {
    const module = widgetModule(id);
    return !saved.hidden.includes(id) && (module === undefined || modules[module]);
  });
}
