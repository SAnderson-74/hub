import { describe, expect, it } from "vitest";
import { CODE39_CHARACTERS, canEncode, code39Bars } from "./code39";

describe("Code 39", () => {
  it("draws each character as five bars, with start and stop marks", () => {
    // "*" + 1 character + "*": three characters of five bars each.
    expect(code39Bars("A").bars).toHaveLength(15);
    // Each character is 6 narrow + 3 wide elements (15 units), plus gaps between.
    expect(code39Bars("R-0042").width).toBe(8 * 15 + 7);
  });

  it("knows what it can hold", () => {
    expect(CODE39_CHARACTERS).toHaveLength(39);
    expect(canEncode("R-0042")).toBe(true);
    expect(canEncode("r-0042")).toBe(false);
    expect(canEncode("A*B")).toBe(false);
    expect(canEncode("")).toBe(false);
    expect(() => code39Bars("ÿ")).toThrow();
  });
});
