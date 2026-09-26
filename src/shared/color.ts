// Color helpers shared by the server (validation) and the browser (theming).
// All colors are 6-digit hex strings like "#22d3ee".

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Background the accent is drawn on (matches --color-base in styles.css). */
export const BASE_BACKGROUND = "#17202e";
const DARK_TEXT = "#0d121b";
const LIGHT_TEXT = "#ffffff";

type Rgb = { r: number; g: number; b: number };

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

export function hexToRgb(hex: string): Rgb {
  if (!isHexColor(hex)) {
    throw new Error(`Expected a color like #22d3ee, got "${hex}"`);
  }
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text color (near-black or white) that reads best on top of `background`. */
export function readableTextOn(background: string): string {
  return contrastRatio(background, DARK_TEXT) >= contrastRatio(background, LIGHT_TEXT)
    ? DARK_TEXT
    : LIGHT_TEXT;
}

/** Mix `hex` toward white by `amount` (0 to 1). */
export function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const t = Math.min(1, Math.max(0, amount));
  return rgbToHex({ r: r + (255 - r) * t, g: g + (255 - g) * t, b: b + (255 - b) * t });
}

/**
 * Returns `color` if it has at least `minRatio` contrast against `background`,
 * otherwise the smallest lightened version of it that does. Keeps accent-colored
 * text readable even when someone picks a dark accent.
 */
export function ensureContrast(
  color: string,
  background = BASE_BACKGROUND,
  minRatio = 4.5,
): string {
  if (contrastRatio(color, background) >= minRatio) return color.toLowerCase();
  for (let step = 1; step <= 20; step++) {
    const candidate = lighten(color, step * 0.05);
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
  }
  return LIGHT_TEXT;
}
