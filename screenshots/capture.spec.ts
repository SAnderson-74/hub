import { type Locator, type Page, test } from "@playwright/test";

/** Where each screen is saved, and what to wait for before taking it. */
const SCREENS: Array<{
  name: string;
  path: string;
  ready: (page: Page) => Promise<void>;
  /** Saved only at these sizes; both when left out. */
  only?: "phone" | "desktop";
  setup?: (page: Page) => Promise<unknown>;
  /** On phones, scrolled to the top of the screen first. */
  phoneFocus?: (page: Page) => Locator;
}> = [
  {
    name: "home",
    path: "/",
    ready: (page) => page.getByText("Replace the smoke detector batteries").first().waitFor(),
  },
  {
    name: "tasks",
    path: "/tasks",
    only: "desktop",
    ready: (page) => page.getByText("Book a dentist visit").first().waitFor(),
  },
  {
    name: "time",
    path: "/time",
    only: "phone",
    ready: (page) => page.getByRole("region", { name: "Timers" }).waitFor(),
  },
  {
    name: "goals",
    path: "/goals",
    only: "desktop",
    ready: (page) => page.getByText("Emergency fund").first().waitFor(),
  },
  {
    name: "courses",
    path: "/courses",
    only: "desktop",
    ready: (page) => page.getByText("Introduction to Networks").first().waitFor(),
  },
  {
    name: "resale",
    path: "/resale",
    only: "desktop",
    ready: (page) => page.getByText("Road bike").first().waitFor(),
  },
  {
    name: "budget",
    path: "/money",
    setup: (page) => page.addInitScript(() => localStorage.setItem("hub.money.view", "budget")),
    ready: (page) =>
      page.getByRole("region", { name: "Cash flow" }).locator("figure svg").waitFor(),
    phoneFocus: (page) => page.getByRole("region", { name: "Cash flow" }),
  },
  {
    name: "business",
    path: "/business",
    only: "desktop",
    ready: (page) => page.getByText("Register the business name").first().waitFor(),
  },
];

for (const screen of SCREENS) {
  test(screen.name, async ({ page }, testInfo) => {
    const size = testInfo.project.name as "phone" | "desktop";
    test.skip(screen.only !== undefined && screen.only !== size, `Only at ${screen.only} size`);
    await screen.setup?.(page);
    await page.goto(screen.path);
    await screen.ready(page);
    // Let charts and fonts settle.
    await page.waitForLoadState("networkidle");
    if (size === "phone" && screen.phoneFocus) {
      // Clear of the sticky header.
      await screen.phoneFocus(page).evaluate((element) => {
        element.scrollIntoView();
        window.scrollBy(0, -72);
      });
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: `docs/screenshots/${screen.name}-${size}.png` });
  });
}
