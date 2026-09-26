import { describe, expect, it } from "vitest";
import { phoneNav } from "./nav";

const pages = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `p${index}` }));
const ids = (list: Array<{ id: string }>) => list.map((page) => page.id);

describe("phone navigation", () => {
  it("gives every page a tab when five or fewer", () => {
    expect(phoneNav(pages(5))).toEqual({ tabs: pages(5), more: [] });
  });

  it("keeps four tabs and moves the rest under More", () => {
    const nav = phoneNav(pages(7));
    expect(ids(nav.tabs)).toEqual(["p0", "p1", "p2", "p3"]);
    expect(ids(nav.more)).toEqual(["p4", "p5", "p6"]);
  });
});
