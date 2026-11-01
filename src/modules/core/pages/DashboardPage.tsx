import { Settings2 } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "../../../client/components/PageHeader";
import { iconSecondaryButton } from "../../../client/components/ui";
import { homeWidgetViews } from "../../../client/homeWidgets";
import { formatLongDate, greetingFor } from "../../../client/lib/format";
import { useModules, useSettings, useSystem } from "../../../client/lib/queries";
import { useNow } from "../../../client/lib/useNow";
import { defaultHomeWidgets, visibleWidgets } from "../../../shared/homeWidgets";
import { localDate } from "../../tasks/dates";

export function DashboardPage() {
  const system = useSystem();
  const settings = useSettings();
  const now = useNow();
  const firstName = system.data?.user.name.split(/\s+/)[0];
  const greeting = greetingFor(now.getHours());
  const today = localDate(now);
  const modules = useModules();
  // Until settings load, the usual widgets in the usual order.
  const widgets = visibleWidgets(settings.data?.homeWidgets ?? defaultHomeWidgets, modules);

  return (
    <>
      <PageHeader
        title={firstName ? `${greeting}, ${firstName}` : greeting}
        subtitle={formatLongDate(now)}
        actions={
          <Link
            to="/settings#home"
            aria-label="Choose what Home shows"
            data-tip=""
            className={iconSecondaryButton}
          >
            <Settings2 aria-hidden="true" className="size-[1.125rem]" />
          </Link>
        }
      />
      {/* Two to a row on wide screens, three on large ones; each row's panels share a height. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4 2xl:grid-cols-3">
        {widgets.map((id) => {
          const view = homeWidgetViews[id];
          return (
            <div
              key={id}
              className={`grid min-w-0 ${view.wide ? "lg:col-span-2 2xl:col-span-3" : ""}`}
            >
              {view.render({ today, className: "" })}
            </div>
          );
        })}
      </div>
    </>
  );
}
