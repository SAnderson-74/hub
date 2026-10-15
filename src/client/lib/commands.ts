import {
  BadgePercent,
  CalendarDays,
  ChartLine,
  FileUp,
  Keyboard,
  LayoutGrid,
  LayoutTemplate,
  Lightbulb,
  type LucideIcon,
  Moon,
  PackagePlus,
  PiggyBank,
  Plus,
  Sunrise,
  Target,
  Timer,
  TrendingUp,
} from "lucide-react";
import type { ModuleId, ModuleSettings } from "../../shared/modules";
import type { AppPage } from "../pages";

// What the command menu offers besides search results: actions and pages. An action
// is a link with `?do=<name>`, which the page carries out when it opens (see
// useCommand), so it works from any page and from a bookmark.

export type Command = {
  id: string;
  label: string;
  /** Other words it answers to, like "new" for "Add a task". */
  keywords: string;
  icon: LucideIcon;
  group: "Actions" | "Pages";
  /** Where it goes, or "help" for the list of shortcuts. */
  to: string;
  /** Keys that do the same, like ["G", "T"]. */
  keys?: string[];
  module?: ModuleId;
};

const ACTIONS: Array<Omit<Command, "group">> = [
  {
    id: "add-task",
    label: "Add a task",
    keywords: "new create todo",
    icon: Plus,
    to: "/tasks?do=add-task",
    module: "tasks",
  },
  {
    id: "plan",
    label: "Plan the day",
    keywords: "today estimate hours morning",
    icon: Sunrise,
    to: "/tasks?list=today&do=plan",
    module: "tasks",
  },
  {
    id: "shutdown",
    label: "Shut down for the day",
    keywords: "evening tomorrow move wrap up",
    icon: Moon,
    to: "/tasks?list=today&do=shutdown",
    module: "tasks",
  },
  {
    id: "templates",
    label: "Use a template",
    keywords: "checklist reuse project tasks",
    icon: LayoutTemplate,
    to: "/tasks?do=templates",
    module: "tasks",
  },
  {
    id: "start-timer",
    label: "Start a timer",
    keywords: "time track clock",
    icon: Timer,
    to: "/time?do=start-timer",
    module: "time",
  },
  {
    id: "add-goal",
    label: "Add a goal",
    keywords: "new create",
    icon: Target,
    to: "/goals?do=add-goal",
    module: "goals",
  },
  {
    id: "add-item",
    label: "Add a resale item",
    keywords: "new create stock inventory",
    icon: PackagePlus,
    to: "/resale?do=add-item",
    module: "resale",
  },
  {
    id: "add-transaction",
    label: "Add a transaction",
    keywords: "new create spending money expense income",
    icon: Plus,
    to: "/money?do=add-transaction",
    module: "money",
  },
  {
    id: "import",
    label: "Import a bank file",
    keywords: "csv ofx qfx statement upload money",
    icon: FileUp,
    to: "/money?do=import",
    module: "money",
  },
  {
    id: "budget",
    label: "Go to Budget",
    keywords: "money spending left",
    icon: PiggyBank,
    to: "/money?do=budget",
    module: "money",
  },
  {
    id: "bills",
    label: "Go to Bills",
    keywords: "money subscriptions recurring calendar income",
    icon: CalendarDays,
    to: "/money?do=bills",
    module: "money",
  },
  {
    id: "forecast",
    label: "Go to Forecast",
    keywords: "money cash flow balance ahead low",
    icon: ChartLine,
    to: "/money?do=forecast",
    module: "money",
  },
  {
    id: "insights",
    label: "Go to Insights",
    keywords: "money spending trends month year review compare stores categories",
    icon: Lightbulb,
    to: "/money?do=insights",
    module: "money",
  },
  {
    id: "rewards",
    label: "Go to Rewards",
    keywords: "money cards points cash back",
    icon: BadgePercent,
    to: "/money?do=rewards",
    module: "money",
  },
  {
    id: "net-worth",
    label: "Go to Net worth",
    keywords: "money balance assets debts",
    icon: TrendingUp,
    to: "/money?do=net-worth",
    module: "money",
  },
  {
    id: "home-widgets",
    label: "Choose what Home shows",
    keywords: "widgets dashboard settings",
    icon: LayoutGrid,
    to: "/settings#home",
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    keywords: "keys help",
    icon: Keyboard,
    to: "help",
  },
];

/** The actions for turned-on modules, then a "Go to" for each page. */
export function appCommands(pages: AppPage[], modules: ModuleSettings): Command[] {
  const actions = ACTIONS.filter((action) => !action.module || modules[action.module]).map(
    (action) => ({ ...action, group: "Actions" as const }),
  );
  const goTo = pages.map((page) => ({
    id: `page-${page.id}`,
    label: `Go to ${page.label}`,
    keywords: "page open",
    icon: page.icon,
    group: "Pages" as const,
    to: page.path,
    keys: ["G", page.key.toUpperCase()],
    ...(page.module ? { module: page.module } : {}),
  }));
  return [...actions, ...goTo];
}

/**
 * Commands whose label or keywords hold every word typed, ones whose label starts with
 * it first. Everything, in order, when nothing is typed.
 */
export function matchCommands(commands: Command[], query: string): Command[] {
  const text = query.trim().toLowerCase();
  if (!text) return commands;
  const words = text.split(/\s+/);
  const scored = commands
    .map((command, index) => {
      const label = command.label.toLowerCase();
      const haystack = `${label} ${command.keywords}`;
      if (!words.every((word) => haystack.includes(word))) return null;
      // "Go to Tasks" answers "tasks" as well as "go to t".
      const bare = label.replace(/^go to /, "");
      const rank = label.startsWith(text) || bare.startsWith(text) ? 0 : 1;
      return { command, rank, index };
    })
    .filter((item) => item !== null);
  scored.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return scored.map((item) => item.command);
}

/** Whether a key press is meant for a field, so shortcuts leave it alone. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  // Checkboxes, radios, and buttons take no text.
  return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(
    target.type,
  );
}

/** "⌘K" on Apple devices, "Ctrl+K" elsewhere. */
export function menuKeyLabel(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? "⌘K" : "Ctrl+K";
}
