import { describe, expect, it } from "vitest";
import {
  BASE_BACKGROUND,
  contrastRatio,
  ensureContrast,
  hexToRgb,
  isHexColor,
  readableTextOn,
  rgbToHex,
} from "./color";
import { ACCENT_PRESETS, defaultSettings, settingsPatchSchema } from "./settings";

describe("color helpers", () => {
  it("parses and formats hex colors", () => {
    expect(hexToRgb("#22d3ee")).toEqual({ r: 0x22, g: 0xd3, b: 0xee });
    expect(rgbToHex({ r: 0x22, g: 0xd3, b: 0xee })).toBe("#22d3ee");
    expect(isHexColor("#abc")).toBe(false);
    expect(() => hexToRgb("teal")).toThrow();
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("picks readable text for filled accent buttons", () => {
    expect(readableTextOn("#22d3ee")).toBe("#11111b");
    expect(readableTextOn("#1d3a8a")).toBe("#ffffff");
  });

  it("lightens dark accents until they are readable on the base background", () => {
    const fixed = ensureContrast("#3b0a45");
    expect(contrastRatio(fixed, BASE_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast("#22D3EE")).toBe("#22d3ee");
  });

  it("keeps every preset readable as text on the base background", () => {
    for (const preset of ACCENT_PRESETS) {
      expect(contrastRatio(preset.hex, BASE_BACKGROUND), preset.name).toBeGreaterThanOrEqual(4.5);
    }
    expect(ACCENT_PRESETS[0]?.hex).toBe(defaultSettings.accentColor);
  });
});

describe("settings validation", () => {
  it("normalizes colors and rejects unknown keys", () => {
    expect(settingsPatchSchema.parse({ accentColor: " #FF5FB7 " })).toEqual({
      accentColor: "#ff5fb7",
    });
    expect(settingsPatchSchema.safeParse({ accentColor: "pink" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ somethingElse: true }).success).toBe(false);
  });
});
