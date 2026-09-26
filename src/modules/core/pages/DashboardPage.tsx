import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { StatusDot, toneLabel } from "../../../client/components/StatusDot";
import { formatLongDate, greetingFor } from "../../../client/lib/format";
import { useSystem } from "../../../client/lib/queries";
import { useNow } from "../../../client/lib/useNow";
import { localDate } from "../../tasks/dates";
import { MilestonesPanel, StreakPanel, TermPanel, TodayPanel } from "../components/HomeWidgets";
import { overallTone, type SystemCheck, systemChecks } from "../system-checks";

function CheckTiles({ checks }: { checks: SystemCheck[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
  const today = localDate(now);

  return (
    <>
      <PageHeader
        title={firstName ? `${greeting}, ${firstName}` : greeting}
        subtitle={formatLongDate(now)}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="grid grid-cols-1 gap-4 lg:col-span-7 lg:gap-6">
          <TodayPanel today={today} />
          <MilestonesPanel today={today} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:col-span-5 lg:gap-6">
          <StreakPanel />
          <TermPanel today={today} />
        </div>

        <Panel
          title="System"
          className="lg:col-span-12"
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
      </div>
    </>
  );
}
