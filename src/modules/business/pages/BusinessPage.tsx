import {
  Award,
  Calculator,
  ListChecks,
  type LucideIcon,
  NotebookPen,
  Users,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../../client/components/PageHeader";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { useSettings } from "../../../client/lib/queries";
import { useNow } from "../../../client/lib/useNow";
import { localDate } from "../../tasks/dates";
import { GearView } from "../components/GearView";
import { LeadsView } from "../components/LeadsView";
import { NotesView } from "../components/NotesView";
import { PlanView } from "../components/PlanView";
import { RateView } from "../components/RateView";
import { SkillsView } from "../components/SkillsView";
import { type Business, useBusiness } from "../queries";
import { leadTotals, planTotals } from "../summary";

const VIEW_KEY = "hub.business.view";
const VIEWS = [
  ["plan", "Plan", ListChecks],
  ["gear", "Gear", Wrench],
  ["skills", "Skills", Award],
  ["rate", "Rate", Calculator],
  ["leads", "Leads", Users],
  ["notes", "Notes", NotebookPen],
] as const satisfies ReadonlyArray<readonly [string, string, LucideIcon]>;
type View = (typeof VIEWS)[number][0];

function storedView(): View {
  try {
    const value = localStorage.getItem(VIEW_KEY);
    return VIEWS.find(([view]) => view === value)?.[0] ?? "plan";
  } catch {
    return "plan";
  }
}

/** "4 of 12 steps done · 3 open leads" */
function summary(data: Business): string {
  const steps = planTotals(data.phases.flatMap((phase) => phase.steps));
  const { open } = leadTotals(data.leads);
  return [
    steps.steps > 0 ? `${steps.done} of ${steps.steps} steps done` : "No plan yet",
    open > 0 ? `${open} open ${open === 1 ? "lead" : "leads"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Getting a business ready: the plan, gear, skills, pricing, leads, and notes. */
export function BusinessPage() {
  const today = localDate(useNow());
  const business = useBusiness();
  const settings = useSettings();
  const [view, setView] = useState<View>(storedView);
  const choose = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private browsing; the choice still applies to this visit.
    }
  };

  return (
    <>
      <PageHeader title="Business" subtitle={business.data ? summary(business.data) : undefined} />
      <fieldset className="mb-6 flex max-w-full overflow-x-auto rounded-full bg-mantle p-1 ring-1 ring-surface-0/60 sm:w-fit">
        <legend className="sr-only">View</legend>
        {VIEWS.map(([value, label, Icon]) => (
          <label key={value} className="relative shrink-0">
            <input
              type="radio"
              name="business-view"
              value={value}
              checked={view === value}
              onChange={() => choose(value)}
              className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
            />
            <span className="pointer-events-none flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold whitespace-nowrap text-muted peer-checked:bg-surface-0 peer-checked:text-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text sm:px-4">
              <Icon aria-hidden="true" className="hidden size-4 sm:block" />
              {label}
            </span>
          </label>
        ))}
      </fieldset>

      {view === "rate" ? (
        settings.isPending ? (
          <LoadingRows rows={3} />
        ) : settings.isError ? (
          <ErrorNote error={settings.error} onRetry={() => void settings.refetch()} />
        ) : (
          <RateView saved={settings.data.businessRate} />
        )
      ) : business.isPending ? (
        <LoadingRows rows={4} />
      ) : business.isError ? (
        <ErrorNote error={business.error} onRetry={() => void business.refetch()} />
      ) : view === "plan" ? (
        <PlanView phases={business.data.phases} today={today} />
      ) : view === "gear" ? (
        <GearView gear={business.data.gear} today={today} />
      ) : view === "skills" ? (
        <SkillsView skills={business.data.skills} today={today} />
      ) : view === "leads" ? (
        <LeadsView leads={business.data.leads} today={today} />
      ) : (
        <NotesView notes={business.data.notes} today={today} />
      )}
    </>
  );
}
