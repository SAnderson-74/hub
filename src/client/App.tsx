import { useEffect } from "react";
import { Route, Routes } from "react-router";
import { ModuleOffPage } from "../modules/core/pages/ModuleOffPage";
import { MorePage } from "../modules/core/pages/MorePage";
import { NotFoundPage } from "../modules/core/pages/NotFoundPage";
import { SetupPage } from "../modules/core/pages/SetupPage";
import { AppShell } from "./components/AppShell";
import { phoneNav } from "./lib/nav";
import { useModules, useSettings, useSetup } from "./lib/queries";
import { appPages } from "./pages";
import { applyAccent } from "./theme";

export function App() {
  const settings = useSettings();
  const setup = useSetup();
  const modules = useModules();
  const accent = settings.data?.accentColor;

  useEffect(() => {
    if (accent) applyAccent(accent);
  }, [accent]);

  // A new, empty install starts with setup. Until the answer comes, show nothing, so
  // the app doesn't flash first.
  if (setup.isPending) return null;
  if (setup.data?.needed) return <SetupPage serverTimeZone={setup.data.serverTimeZone} />;

  const shown = appPages.filter((page) => !page.module || modules[page.module]);
  return (
    <Routes>
      <Route element={<AppShell pages={shown} />}>
        {appPages.map((page) => {
          const element =
            page.module && !modules[page.module] ? (
              <ModuleOffPage key={page.id} label={page.label} />
            ) : (
              page.element
            );
          return page.path === "/" ? (
            <Route key={page.id} index element={element} />
          ) : (
            <Route key={page.id} path={page.path.slice(1)} element={element} />
          );
        })}
        <Route path="more" element={<MorePage pages={phoneNav(shown).more} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
