import { describe, expect, it } from "vitest";
import { centsToInput, formatCents, parseDollars } from "./money";

describe("money", () => {
  it("formats cents as dollars", () => {
    expect(formatCents(125_000)).toBe("$1,250");
    expect(formatCents(125_050)).toBe("$1,250.50");
    expect(formatCents(99)).toBe("$0.99");
    expect(formatCents(0)).toBe("$0");
  });

  it("parses typed amounts without floating-point surprises", () => {
    expect(parseDollars("1,250")).toBe(125_000);
    expect(parseDollars(" $1250.5 ")).toBe(125_050);
    expect(parseDollars("0.29")).toBe(29);
    expect(parseDollars("19.99")).toBe(1999);
    for (const bad of ["", "-5", "1.234", "abc", "1,2,3.x", "$"]) {
      expect(parseDollars(bad)).toBeNull();
    }
  });

  it("round-trips through the input format", () => {
    expect(centsToInput(125_000)).toBe("1250");
    expect(centsToInput(125_050)).toBe("1250.50");
    expect(parseDollars(centsToInput(1999))).toBe(1999);
  });
});
