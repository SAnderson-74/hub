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
import { type PageTab, PageTabs } from "../../../client/components/PageTabs";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { useSettings } from "../../../client/lib/queries";
import { useCommand } from "../../../client/lib/useCommand";
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
const VIEW_TABS: readonly PageTab<View>[] = VIEWS.map(([value, label, icon]) => ({
  value,
  label,
  icon,
}));

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
  // Search results for leads and notes switch to their view first.
  useCommand("leads", () => choose("leads"));
  useCommand("notes", () => choose("notes"));

  return (
    <>
      <PageHeader title="Business" subtitle={business.data ? summary(business.data) : undefined} />
      <PageTabs label="View" name="business-view" tabs={VIEW_TABS} value={view} onChange={choose} />

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
