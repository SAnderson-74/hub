import { describe, expect, it } from "vitest";
import {
  centsToInput,
  formatCents,
  parseDollars,
  parseSignedDollars,
  signedCentsToInput,
} from "./money";

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

describe("parseSignedDollars", () => {
  it("reads a leading minus sign, and nothing else new", () => {
    expect(parseSignedDollars("-250")).toBe(-25_000);
    expect(parseSignedDollars(" −$1,250.50 ")).toBe(-125_050);
    expect(parseSignedDollars("12.5")).toBe(1_250);
    expect(parseSignedDollars("--5")).toBeNull();
    expect(parseSignedDollars("5-")).toBeNull();
    expect(parseSignedDollars("-")).toBeNull();
  });

  it("round-trips through signedCentsToInput", () => {
    for (const cents of [-125_050, -25_000, 0, 99, 125_050]) {
      expect(parseSignedDollars(signedCentsToInput(cents))).toBe(cents);
    }
  });
});
