import { describe, expect, it } from "vitest";
import { inventoryDocumentSchema, inventoryRows, withoutIdentifiers } from "./inventory";
import { readImportRow } from "./resaleImport";

const rowsOf = (items: Array<Record<string, unknown>>) =>
  inventoryRows(inventoryDocumentSchema.parse({ format: "hub-inventory/v1", items, extra: 1 }));

describe("items pasted from the Claude Project", () => {
  it("become rows for the item import, with brand and model in the notes", () => {
    const { rows, cleaned } = rowsOf([
      {
        title: "Phone, 128 GB, blue",
        brand: "Example",
        model: "X1",
        condition: "used",
        category: "Phones",
        purchase: { price: 40, date: "2030-01-10", from: "Garage sale" },
        notes: "Charger included.",
        somethingElse: "ignored",
      },
      { title: "Desk lamp", status: "repairing" },
    ]);
    expect(rows).toEqual([
      {
        title: "Phone, 128 GB, blue",
        status: "acquired",
        category: "Phones",
        condition: "used",
        purchasedOn: "2030-01-10",
        purchasePrice: "40",
        purchaseFrom: "Garage sale",
        notes: "Brand: Example\nModel: X1\nCharger included.",
      },
      { title: "Desk lamp", status: "repairing" },
    ]);
    expect(cleaned).toBe(0);
    // The import reads them like a spreadsheet's rows: missing details flag a review.
    expect(readImportRow(rows[0] ?? {})?.problems).toEqual([]);
    expect(readImportRow(rows[1] ?? {})?.problems).toEqual(["No price paid.", "No purchase date."]);
  });

  it("take out serial, IMEI, and other long numbers", () => {
    expect(withoutIdentifiers("Laptop, serial: C02XG0FDH7JY, 16 GB")).toBe("Laptop, 16 GB");
    expect(withoutIdentifiers("S/N 4815-1623-42")).toBe("");
    expect(withoutIdentifiers("Phone IMEI 356938035643809 unlocked")).toBe("Phone unlocked");
    expect(withoutIdentifiers("Box with code 356938035643809")).toBe("Box with code ••3809");
    expect(withoutIdentifiers("Model A1234, 2 TB")).toBe("Model A1234, 2 TB");
    const { rows, cleaned } = rowsOf([
      { title: "Tablet IMEI: 356938035643809", notes: "Serial number DMPXK2ABCD. Works." },
      { title: "Speaker" },
    ]);
    expect(rows[0]).toMatchObject({ title: "Tablet", notes: "Works." });
    expect(cleaned).toBe(1);
  });

  it("cap how much one paste can hold", () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ title: `Item ${i}` }));
    expect(
      inventoryDocumentSchema.safeParse({ format: "hub-inventory/v1", items: many }).success,
    ).toBe(false);
    expect(
      inventoryDocumentSchema.safeParse({
        format: "hub-inventory/v1",
        items: [{ title: "Sold thing", status: "sold" }],
      }).success,
    ).toBe(false);
  });
});
