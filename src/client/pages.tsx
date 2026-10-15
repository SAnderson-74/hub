import {
  Briefcase,
  GraduationCap,
  HandCoins,
  House,
  Landmark,
  ListTodo,
  type LucideIcon,
  Package,
  Repeat,
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
import { HabitsPage } from "../modules/habits/pages/HabitsPage";
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
  /** The key after G that goes here, like "t" for G then T. */
  key: string;
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
  { id: "home", key: "h", label: "Home", path: "/", icon: House, element: <DashboardPage /> },
  {
    id: "tasks",
    key: "t",
    label: "Tasks",
    path: "/tasks",
    icon: ListTodo,
    element: <TasksPage />,
    module: "tasks",
  },
  {
    id: "time",
    key: "i",
    label: "Time",
    path: "/time",
    icon: Timer,
    element: <TimePage />,
    module: "time",
  },
  {
    id: "goals",
    key: "g",
    label: "Goals",
    path: "/goals",
    icon: Target,
    element: <GoalsPage />,
    module: "goals",
  },
  {
    id: "courses",
    key: "c",
    module: "courses",
    label: "Courses",
    path: "/courses",
    icon: GraduationCap,
    element: <CoursesPage />,
  },
  {
    id: "habits",
    key: "a",
    label: "Habits",
    path: "/habits",
    icon: Repeat,
    element: <HabitsPage />,
    module: "habits",
  },
  {
    id: "resale",
    key: "r",
    label: "Resale",
    path: "/resale",
    icon: Package,
    element: <ResalePage />,
    module: "resale",
  },
  {
    id: "money",
    key: "m",
    label: "Money",
    path: "/money",
    icon: Wallet,
    element: <MoneyPage />,
    module: "money",
  },
  {
    id: "tithing",
    key: "d",
    label: "Tithing",
    path: "/tithing",
    icon: HandCoins,
    element: <TithingPage />,
    module: "tithing",
  },
  {
    id: "taxes",
    key: "x",
    label: "Taxes",
    path: "/taxes",
    icon: Landmark,
    element: <TaxesPage />,
    module: "taxes",
  },
  {
    id: "business",
    key: "b",
    module: "business",
    label: "Business",
    path: "/business",
    icon: Briefcase,
    element: <BusinessPage />,
  },
  {
    id: "settings",
    key: "s",
    label: "Settings",
    path: "/settings",
    icon: Settings,
    element: <SettingsPage />,
  },
];
