/**
 * A small CSV reader (RFC 4180): quoted fields with commas, line breaks, and ""
 * escapes. The delimiter is a comma, semicolon, or tab, whichever the header line
 * uses most. A leading byte-order mark (as Excel writes) is dropped.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines (often at the end) aren't rows.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length - 1,
  }));
  const best = counts.reduce((top, entry) => (entry.count > top.count ? entry : top));
  return best.count > 0 ? best.delimiter : ",";
}
