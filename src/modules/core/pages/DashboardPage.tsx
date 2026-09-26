import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { StatusDot, toneLabel } from "../../../client/components/StatusDot";
import { formatLongDate, greetingFor } from "../../../client/lib/format";
import { useSystem } from "../../../client/lib/queries";
import { useNow } from "../../../client/lib/useNow";
import { overallTone, type SystemCheck, systemChecks } from "../system-checks";

const ROADMAP = [
  { title: "Tasks, goals, and courses", detail: "Kanban, subtasks, time tracking, study streaks" },
  { title: "Resale tracking", detail: "Costs, fees, price history, profit per hour" },
  { title: "Budget and tax guide", detail: "Accounts, imports, budgets, savings goals" },
  {
    title: "Business prep and home automation",
    detail: "Checklists, notifications, dashboard sensors",
  },
];

function CheckTiles({ checks }: { checks: SystemCheck[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {checks.map((check) => (
        <li key={check.id} className="min-w-0 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
          <p className="flex items-center gap-2 text-sm font-semibold text-muted">
            <StatusDot tone={check.tone} />
            {check.label}
            <span className="sr-only">: {toneLabel[check.tone]}</span>
          </p>
          <p className="mt-3 truncate text-xl font-bold tracking-[-0.02em] tabular-nums text-fg">
            {check.value}
          </p>
          <p className="mt-1 line-clamp-2 text-sm break-words text-muted">{check.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  const system = useSystem();
  const now = useNow();
  const firstName = system.data?.user.name.split(/\s+/)[0];
  const greeting = greetingFor(now.getHours());
  const checks = system.data ? systemChecks(system.data, now) : [];
  const tone = overallTone(checks);
  const attention = checks.filter((check) => check.tone === "warn" || check.tone === "danger");

  return (
    <>
      <PageHeader
        title={firstName ? `${greeting}, ${firstName}` : greeting}
        subtitle={formatLongDate(now)}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        <Panel
          title="System"
          className="lg:col-span-8"
          description={
            system.data ? (
              <span className="flex items-center gap-2">
                <StatusDot tone={tone} />
                {attention.length === 0
                  ? "Everything looks healthy."
                  : `Needs a look: ${attention.map((check) => check.label.toLowerCase()).join(", ")}.`}
              </span>
            ) : undefined
          }
        >
          {system.isPending ? (
            <LoadingRows />
          ) : system.isError ? (
            <ErrorNote error={system.error} onRetry={() => void system.refetch()} />
          ) : (
            <CheckTiles checks={checks} />
          )}
        </Panel>

        <Panel
          title="Next up"
          description="Modules planned for this hub."
          className="lg:col-span-4"
        >
          <ol className="space-y-4">
            {ROADMAP.map((item, index) => (
              <li key={item.title} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-0 text-sm font-bold tabular-nums text-accent-text">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-fg">{item.title}</p>
                  <p className="text-sm text-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  );
}
