import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROJECT_FORMATS, PROJECT_INSTRUCTIONS, readPaste } from "./claudeProject";
import { educationImportSchema } from "./education";
import { inventoryDocumentSchema } from "./inventory";
import { hasLongNumber, receiptDocumentSchema } from "./receipts";
import { listingImportSchema } from "./resaleListing";
import { statementDocumentSchema } from "./statement";
import { tasksDocumentSchema } from "./tasksImport";

const receipts = {
  format: "hub-receipt/v1",
  receipts: [{ store: "A", date: "2030-01-01", total: 1 }],
};

describe("reading a pasted answer", () => {
  it("finds the JSON in a code block, with words around it", () => {
    const read = readPaste(
      `Here are your receipts:\n\n\`\`\`json\n${JSON.stringify(receipts)}\n\`\`\`\n\nAnything else?`,
    );
    expect(read).toMatchObject({ ok: true, format: { label: "Receipts" }, data: receipts });
    expect(readPaste(JSON.stringify(receipts))).toMatchObject({ ok: true });
    expect(readPaste("  ")).toBeNull();
  });

  it("knows each format and where it goes", () => {
    for (const entry of PROJECT_FORMATS) {
      expect(readPaste(JSON.stringify({ format: entry.format }))).toMatchObject({
        ok: true,
        format: entry,
      });
    }
  });

  it("says what's wrong with anything else", () => {
    const error = (text: string) => {
      const read = readPaste(text);
      return read && !read.ok ? read.error : null;
    };
    expect(error("{ not json")).toBe(
      "That doesn't look like what the Claude Project gives. Copy its whole answer.",
    );
    expect(error('{ "format": "hub-receipt/v1", "receipts": [ }')).toContain(
      "Part of it is missing",
    );
    expect(error('{ "receipts": [] }')).toContain("doesn't say what it is");
    expect(error('{ "format": "hub-example/v9" }')).toBe(
      "Hub doesn't take \"hub-example/v9\" yet. It takes receipts, bank statements, items to sell, resale listings, tasks and goals, and study plans. Check that the Project has Hub's latest instructions.",
    );
    const one = `\`\`\`json\n${JSON.stringify(receipts)}\n\`\`\``;
    expect(error(`${one}\n${one}`)).toBe(
      "This has more than one answer in it. Paste one at a time.",
    );
    expect(error(`{"format":"hub-receipt/v1","x":"${"a".repeat(1024 * 1024)}"}`)).toContain(
      "too long",
    );
  });
});

describe("the Project's instructions", () => {
  const examples = [...PROJECT_INSTRUCTIONS.matchAll(/^\{\n[\s\S]*?\n\}$/gm)].map((match) =>
    JSON.parse(match[0]),
  );

  it("have a valid example of each format", () => {
    expect(examples.map((example) => example.format)).toEqual(
      PROJECT_FORMATS.map((entry) => entry.format),
    );
    const schemas: Record<string, { safeParse: (value: unknown) => { success: boolean } }> = {
      "hub-receipt/v1": receiptDocumentSchema,
      "hub-statement/v1": statementDocumentSchema,
      "hub-inventory/v1": inventoryDocumentSchema,
      "hub-listing/v1": listingImportSchema,
      "hub-tasks/v1": tasksDocumentSchema,
      "hub-education/v1": educationImportSchema,
    };
    for (const example of examples) {
      expect(schemas[example.format]?.safeParse(example).success, example.format).toBe(true);
    }
  });

  it("keep their own examples free of long numbers", () => {
    expect(hasLongNumber(PROJECT_INSTRUCTIONS)).toBe(false);
  });

  it("match docs/CLAUDE_PROJECT.md", () => {
    const doc = readFileSync(new URL("../../docs/CLAUDE_PROJECT.md", import.meta.url), "utf8");
    expect(doc).toContain(`\`\`\`\`text\n${PROJECT_INSTRUCTIONS}\n\`\`\`\``);
  });
});
