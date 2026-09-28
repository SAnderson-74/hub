import {
  Briefcase,
  GraduationCap,
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

export type AppPage = {
  id: string;
  /** Short label for the tab bar and sidebar. */
  label: string;
  /** "/" for home, otherwise a single segment like "/tasks". */
  path: string;
  icon: LucideIcon;
  element: ReactElement;
};

/**
 * Every top-level page, in navigation order. A new module adds its page here. On
 * phones, pages past the fourth move under "More" once there are more than five
 * (see src/client/lib/nav.ts).
 */
export const appPages: AppPage[] = [
  { id: "home", label: "Home", path: "/", icon: House, element: <DashboardPage /> },
  { id: "tasks", label: "Tasks", path: "/tasks", icon: ListTodo, element: <TasksPage /> },
  { id: "time", label: "Time", path: "/time", icon: Timer, element: <TimePage /> },
  { id: "goals", label: "Goals", path: "/goals", icon: Target, element: <GoalsPage /> },
  {
    id: "courses",
    label: "Courses",
    path: "/courses",
    icon: GraduationCap,
    element: <CoursesPage />,
  },
  { id: "resale", label: "Resale", path: "/resale", icon: Package, element: <ResalePage /> },
  { id: "money", label: "Money", path: "/money", icon: Wallet, element: <MoneyPage /> },
  { id: "taxes", label: "Taxes", path: "/taxes", icon: Landmark, element: <TaxesPage /> },
  {
    id: "business",
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
