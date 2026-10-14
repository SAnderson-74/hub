import type { ReactNode } from "react";
import { BusinessWidget } from "../modules/business/components/BusinessWidget";
import {
  MilestonesPanel,
  StreakPanel,
  TermPanel,
  TodayPanel,
} from "../modules/core/components/HomeWidgets";
import { SystemPanel } from "../modules/core/components/SystemPanel";
import { MoneyWidget } from "../modules/money/components/MoneyWidget";
import { ResaleWidget } from "../modules/resale/components/ResaleWidget";
import { TimeWidget } from "../modules/time/components/TimeWidget";
import { TithingWidget } from "../modules/tithing/components/TithingWidget";
import type { HomeWidgetId } from "../shared/homeWidgets";

type WidgetView = {
  render: (props: { today: string; className: string }) => ReactNode;
  /** Takes the whole row on wide screens. */
  wide?: boolean;
};

/**
 * What each Home widget shows. The list, labels, and modules are in
 * src/shared/homeWidgets.ts; a new widget adds an entry there and here.
 */
export const homeWidgetViews: Record<HomeWidgetId, WidgetView> = {
  today: { render: (props) => <TodayPanel {...props} /> },
  milestones: { render: (props) => <MilestonesPanel {...props} /> },
  money: { render: (props) => <MoneyWidget {...props} /> },
  tithing: { render: ({ className }) => <TithingWidget className={className} /> },
  streak: { render: ({ className }) => <StreakPanel className={className} /> },
  term: { render: (props) => <TermPanel {...props} /> },
  time: { render: (props) => <TimeWidget {...props} /> },
  resale: { render: (props) => <ResaleWidget {...props} /> },
  business: { render: (props) => <BusinessWidget {...props} /> },
  system: { render: ({ className }) => <SystemPanel className={className} />, wide: true },
};
