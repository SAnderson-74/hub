// Code 39 barcodes, for item labels. Each character is nine elements, bars and spaces
// in turn starting with a bar, three of them wide; "*" starts and ends the code.
// Most handheld and phone scanners read it.

const PATTERNS: Record<string, string> = {
  "0": "000110100",
  "1": "100100001",
  "2": "001100001",
  "3": "101100000",
  "4": "000110001",
  "5": "100110000",
  "6": "001110000",
  "7": "000100101",
  "8": "100100100",
  "9": "001100100",
  A: "100001001",
  B: "001001001",
  C: "101001000",
  D: "000011001",
  E: "100011000",
  F: "001011000",
  G: "000001101",
  H: "100001100",
  I: "001001100",
  J: "000011100",
  K: "100000011",
  L: "001000011",
  M: "101000010",
  N: "000010011",
  O: "100010010",
  P: "001010010",
  Q: "000000111",
  R: "100000110",
  S: "001000110",
  T: "000010110",
  U: "110000001",
  V: "011000001",
  W: "111000000",
  X: "010010001",
  Y: "110010000",
  Z: "011010000",
  "-": "010000101",
  ".": "110000100",
  " ": "011000100",
  "*": "010010100",
};

/** Wide elements are this many times a narrow one. */
const WIDE = 3;

export const CODE39_CHARACTERS = Object.keys(PATTERNS).filter((char) => char !== "*");

export function canEncode(text: string): boolean {
  return text.length > 0 && [...text].every((char) => char !== "*" && char in PATTERNS);
}

/**
 * The bars for `text`, as x offsets and widths in narrow-bar units, and the total width
 * (with a narrow gap between characters). Throws for characters Code 39 can't hold.
 */
export function code39Bars(text: string): {
  bars: Array<{ x: number; width: number }>;
  width: number;
} {
  if (!canEncode(text)) throw new Error("Code 39 can't encode that text");
  const bars: Array<{ x: number; width: number }> = [];
  let x = 0;
  for (const char of `*${text}*`) {
    const pattern = PATTERNS[char] ?? "";
    [...pattern].forEach((element, index) => {
      const width = element === "1" ? WIDE : 1;
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    });
    x += 1; // the gap between characters
  }
  return { bars, width: x - 1 };
}
