import { describe, expect, it } from "vitest";
import {
  HOME_WIDGET_IDS,
  homeWidgetsSchema,
  orderedWidgets,
  visibleWidgets,
  widgetModule,
} from "./homeWidgets";
import { defaultModules } from "./modules";

describe("home widgets", () => {
  it("start in the default order with everything shown", () => {
    expect(orderedWidgets({ order: [], hidden: [] })).toEqual(HOME_WIDGET_IDS);
    expect(visibleWidgets({ order: [], hidden: [] }, defaultModules)).toEqual(HOME_WIDGET_IDS);
  });

  it("follow the saved order, with new or unknown ids handled", () => {
    const order = orderedWidgets({ order: ["money", "today", "gone", "money"], hidden: [] });
    expect(order.slice(0, 2)).toEqual(["money", "today"]);
    // Widgets missing from the saved order come after it, in their usual order.
    expect(order).toHaveLength(HOME_WIDGET_IDS.length);
    expect(order).not.toContain("gone");
  });

  it("leave out hidden widgets and ones whose module is off", () => {
    const shown = visibleWidgets(
      { order: [], hidden: ["system", "streak"] },
      { ...defaultModules, courses: false, business: false },
    );
    expect(shown).not.toContain("system");
    expect(shown).not.toContain("streak");
    expect(shown).not.toContain("term"); // courses off
    expect(shown).not.toContain("business");
    expect(shown).toContain("today");
    expect(widgetModule("system")).toBeUndefined();
    expect(widgetModule("tithing")).toBe("tithing");
  });

  it("validate the saved arrangement", () => {
    expect(homeWidgetsSchema.safeParse({ order: ["today"], hidden: [] }).success).toBe(true);
    expect(homeWidgetsSchema.safeParse({ order: ["today"] }).success).toBe(false);
    expect(homeWidgetsSchema.safeParse({ order: [], hidden: [], extra: 1 }).success).toBe(false);
  });
});
