import { House, type LucideIcon, Settings } from "lucide-react";
import type { ReactElement } from "react";
import { DashboardPage } from "../modules/core/pages/DashboardPage";
import { SettingsPage } from "../modules/core/pages/SettingsPage";

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
 * Every top-level page, in navigation order. A new module adds its page here
 * (keep the phone tab bar to five items; later pages can live under "More").
 */
export const appPages: AppPage[] = [
  { id: "home", label: "Home", path: "/", icon: House, element: <DashboardPage /> },
  {
    id: "settings",
    label: "Settings",
    path: "/settings",
    icon: Settings,
    element: <SettingsPage />,
  },
];
