import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("reads plain rows and skips blank lines", () => {
    expect(parseCsv("Title,Paid\nLamp,5\n\nChair,12\n")).toEqual([
      ["Title", "Paid"],
      ["Lamp", "5"],
      ["Chair", "12"],
    ]);
  });

  it("handles quotes, embedded commas and line breaks, and escaped quotes", () => {
    const text = 'Title,Notes\r\n"Desk, oak","Two drawers\nstiff"\r\n"The ""good"" lamp",\r\n';
    expect(parseCsv(text)).toEqual([
      ["Title", "Notes"],
      ["Desk, oak", "Two drawers\nstiff"],
      ['The "good" lamp', ""],
    ]);
  });

  it("drops a byte-order mark and detects semicolons and tabs", () => {
    expect(parseCsv("﻿Title;Paid\nLamp;5,50")).toEqual([
      ["Title", "Paid"],
      ["Lamp", "5,50"],
    ]);
    expect(parseCsv("Title\tPaid\nLamp\t5")).toEqual([
      ["Title", "Paid"],
      ["Lamp", "5"],
    ]);
  });

  it("keeps a last row without a trailing newline", () => {
    expect(parseCsv("A,B\n1,2")).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
  });
});
