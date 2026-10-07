import {
  Briefcase,
  GraduationCap,
  HandCoins,
  House,
  Landmark,
  ListTodo,
  type LucideIcon,
  Package,
  Settings,
  Target,
  Timer,
  Wallet,
} from "lucide-react";
import type { ReactElement } from "react";
import { BusinessPage } from "../modules/business/pages/BusinessPage";
import { DashboardPage } from "../modules/core/pages/DashboardPage";
import { SettingsPage } from "../modules/core/pages/SettingsPage";
import { CoursesPage } from "../modules/education/pages/CoursesPage";
import { GoalsPage } from "../modules/goals/pages/GoalsPage";
import { MoneyPage } from "../modules/money/pages/MoneyPage";
import { ResalePage } from "../modules/resale/pages/ResalePage";
import { TasksPage } from "../modules/tasks/pages/TasksPage";
import { TaxesPage } from "../modules/taxes/pages/TaxesPage";
import { TimePage } from "../modules/time/pages/TimePage";
import { TithingPage } from "../modules/tithing/pages/TithingPage";
import type { ModuleId } from "../shared/modules";

export type AppPage = {
  id: string;
  /** Short label for the tab bar and sidebar. */
  label: string;
  /** "/" for home, otherwise a single segment like "/tasks". */
  path: string;
  icon: LucideIcon;
  element: ReactElement;
  /** The module it belongs to, which Settings can turn off. Home and Settings have none. */
  module?: ModuleId;
};

/**
 * Every top-level page, in navigation order. A new module adds its page here. On
 * phones, pages past the fourth move under "More" once there are more than five
 * (see src/client/lib/nav.ts).
 */
export const appPages: AppPage[] = [
  { id: "home", label: "Home", path: "/", icon: House, element: <DashboardPage /> },
  {
    id: "tasks",
    label: "Tasks",
    path: "/tasks",
    icon: ListTodo,
    element: <TasksPage />,
    module: "tasks",
  },
  { id: "time", label: "Time", path: "/time", icon: Timer, element: <TimePage />, module: "time" },
  {
    id: "goals",
    label: "Goals",
    path: "/goals",
    icon: Target,
    element: <GoalsPage />,
    module: "goals",
  },
  {
    id: "courses",
    module: "courses",
    label: "Courses",
    path: "/courses",
    icon: GraduationCap,
    element: <CoursesPage />,
  },
  {
    id: "resale",
    label: "Resale",
    path: "/resale",
    icon: Package,
    element: <ResalePage />,
    module: "resale",
  },
  {
    id: "money",
    label: "Money",
    path: "/money",
    icon: Wallet,
    element: <MoneyPage />,
    module: "money",
  },
  {
    id: "tithing",
    label: "Tithing",
    path: "/tithing",
    icon: HandCoins,
    element: <TithingPage />,
    module: "tithing",
  },
  {
    id: "taxes",
    label: "Taxes",
    path: "/taxes",
    icon: Landmark,
    element: <TaxesPage />,
    module: "taxes",
  },
  {
    id: "business",
    module: "business",
    label: "Business",
    path: "/business",
    icon: Briefcase,
    element: <BusinessPage />,
  },
  {
    id: "settings",
    label: "Settings",
    path: "/settings",
    icon: Settings,
    element: <SettingsPage />,
  },
];
