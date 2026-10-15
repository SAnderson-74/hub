import { describe, expect, it } from "vitest";
import { defaultModules } from "../../shared/modules";
import { appPages } from "../pages";
import { appCommands, matchCommands, menuKeyLabel } from "./commands";

const labels = (list: Array<{ label: string }>) => list.map((item) => item.label);

describe("command menu commands", () => {
  it("offer actions for turned-on modules, then every page", () => {
    const all = appCommands(appPages, defaultModules);
    expect(labels(all)[0]).toBe("Add a task");
    expect(labels(all)).toContain("Plan the day");
    expect(labels(all)).toContain("Start a timer");
    expect(all.find((command) => command.label === "Go to Tasks")).toMatchObject({
      group: "Pages",
      to: "/tasks",
      keys: ["G", "T"],
    });

    const noMoney = appCommands(
      appPages.filter((page) => page.module !== "money"),
      { ...defaultModules, money: false },
    );
    expect(labels(noMoney)).not.toContain("Import a bank file");
    expect(labels(noMoney)).not.toContain("Go to Money");
    expect(labels(noMoney)).toContain("Keyboard shortcuts");
  });

  it("give every page its own G key", () => {
    const keys = appPages.map((page) => page.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => /^[a-z]$/.test(key))).toBe(true);
  });

  it("match every word typed, labels that start with it first", () => {
    const all = appCommands(appPages, defaultModules);
    expect(matchCommands(all, "")).toEqual(all);
    expect(labels(matchCommands(all, "tasks"))[0]).toBe("Go to Tasks");
    expect(labels(matchCommands(all, "new task"))).toEqual(["Add a task"]);
    expect(labels(matchCommands(all, "IMPORT"))).toEqual(["Import a bank file"]);
    expect(labels(matchCommands(all, "csv"))).toEqual(["Import a bank file"]);
    expect(matchCommands(all, "nothing like this")).toEqual([]);
  });

  it("name the menu key for the device", () => {
    expect(menuKeyLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("⌘K");
    expect(menuKeyLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("⌘K");
    expect(menuKeyLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Ctrl+K");
  });
});
