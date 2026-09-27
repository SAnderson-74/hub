import {
  GraduationCap,
  House,
  ListTodo,
  type LucideIcon,
  Package,
  Settings,
  Target,
  Timer,
} from "lucide-react";
import type { ReactElement } from "react";
import { DashboardPage } from "../modules/core/pages/DashboardPage";
import { SettingsPage } from "../modules/core/pages/SettingsPage";
import { CoursesPage } from "../modules/education/pages/CoursesPage";
import { GoalsPage } from "../modules/goals/pages/GoalsPage";
import { ResalePage } from "../modules/resale/pages/ResalePage";
import { TasksPage } from "../modules/tasks/pages/TasksPage";
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
  {
    id: "settings",
    label: "Settings",
    path: "/settings",
    icon: Settings,
    element: <SettingsPage />,
  },
];
