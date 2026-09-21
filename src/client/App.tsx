import { useEffect } from "react";
import { Route, Routes } from "react-router";
import { NotFoundPage } from "../modules/core/pages/NotFoundPage";
import { AppShell } from "./components/AppShell";
import { useSettings } from "./lib/queries";
import { appPages } from "./pages";
import { applyAccent } from "./theme";

export function App() {
  const settings = useSettings();
  const accent = settings.data?.accentColor;

  useEffect(() => {
    if (accent) applyAccent(accent);
  }, [accent]);

  return (
    <Routes>
      <Route element={<AppShell pages={appPages} />}>
        {appPages.map((page) =>
          page.path === "/" ? (
            <Route key={page.id} index element={page.element} />
          ) : (
            <Route key={page.id} path={page.path.slice(1)} element={page.element} />
          ),
        )}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
