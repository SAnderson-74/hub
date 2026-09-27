import { describe, expect, it } from "vitest";
import {
  type HistoryItem,
  historyInputs,
  maxOffer,
  median,
  parsePercent,
  profitAt,
  salesHistory,
} from "./buyCalculator";

const market = { id: 1, name: "Local classifieds" };
const shop = { id: 2, name: "Example Market" };
const sold = (id: number, fields: Partial<HistoryItem>): HistoryItem => {
  const costs = fields.costs ?? [];
  return {
    id,
    title: "Stereo receiver",
    category: "Audio",
    status: "sold",
    purchasedOn: "2030-03-01",
    soldOn: "2030-03-11",
    saleCents: 10_000,
    purchaseCents: 4_000,
    timeMinutes: 0,
    salePlatform: market,
    ...fields,
    costs,
    costsCents: costs.reduce((sum, cost) => sum + cost.amountCents, 0),
  };
};

const input = {
  saleCents: 15_000,
  feePercent: 13,
  fixedFeeCents: 500,
  repairCents: 1_500,
  marginPercent: 30,
};

describe("maxOffer", () => {
  it("takes fees, repair, and the wanted profit from the sale price", () => {
    // $150 - ($19.50 + $5) - $15 - $45 = $65.50
    expect(maxOffer(input)).toEqual({ feesCents: 2_450, profitCents: 4_500, maxOfferCents: 6_550 });
  });

  it("goes to zero or below when nothing leaves the target margin", () => {
    expect(maxOffer({ ...input, repairCents: 9_000 }).maxOfferCents).toBe(-950);
    expect(maxOffer({ ...input, saleCents: 0 }).maxOfferCents).toBe(-2_000);
  });

  it("rounds percent fees and profit to whole cents", () => {
    const offer = maxOffer({ ...input, saleCents: 999, feePercent: 12.9, marginPercent: 33.3 });
    expect(offer.feesCents).toBe(629);
    expect(offer.profitCents).toBe(333);
  });

  it("pays exactly the target margin at the max offer", () => {
    const { maxOfferCents } = maxOffer(input);
    expect(profitAt(input, maxOfferCents)).toEqual({ profitCents: 4_500, margin: 0.3 });
  });
});

describe("profitAt", () => {
  it("shows the profit and margin at an asking price", () => {
    expect(profitAt(input, 5_000)).toEqual({ profitCents: 6_050, margin: 6_050 / 15_000 });
    expect(profitAt({ ...input, saleCents: 0, feePercent: 0, fixedFeeCents: 0 }, 100)).toEqual({
      profitCents: -1_600,
      margin: null,
    });
  });
});

describe("parsePercent", () => {
  it("reads plain numbers and a percent sign", () => {
    expect(parsePercent("13")).toBe(13);
    expect(parsePercent(" 12.5% ")).toBe(12.5);
    expect(parsePercent("0")).toBe(0);
    expect(parsePercent("100")).toBe(100);
  });

  it("rejects anything else", () => {
    for (const text of ["", "-5", "101", "abc", "1.234", "5 percent"]) {
      expect(parsePercent(text)).toBeNull();
    }
  });
});

describe("median", () => {
  it("takes the middle value, or the mean of the middle two", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("salesHistory", () => {
  const items: HistoryItem[] = [
    sold(1, {
      saleCents: 12_000,
      costs: [
        { kind: "fees", amountCents: 1_200 },
        { kind: "shipping", amountCents: 900 },
        { kind: "parts", amountCents: 1_000 },
      ],
    }),
    sold(2, {
      title: "Turntable",
      saleCents: 8_000,
      soldOn: "2030-03-31",
      costs: [{ kind: "fees", amountCents: 800 }],
    }),
    sold(3, {
      title: "Stereo receiver, silver",
      saleCents: 20_000,
      purchaseCents: null,
      salePlatform: shop,
      costs: [{ kind: "supplies", amountCents: 500 }],
    }),
    sold(4, { title: "Desk lamp", category: "Home", saleCents: 3_000, purchasedOn: null }),
    { ...sold(5, {}), status: "listed", soldOn: null, saleCents: null },
    sold(6, { title: "Old radio", saleCents: null }),
  ];

  it("sums up every sale when there's no filter", () => {
    expect(salesHistory(items, { query: "", platformId: null })).toEqual({
      sales: 4,
      medianSaleCents: 10_000,
      // Margins of 41%, 40%, and -33%. Item 3 has no purchase price, so it isn't counted.
      medianMargin: 0.4,
      pricedSales: 3,
      // $20 in fees from $430 in sales.
      feePercent: 4.7,
      medianShippingCents: 0,
      medianRepairCents: 250,
      medianDaysHeld: 10,
    });
  });

  it("matches titles and categories without case, and filters by platform", () => {
    expect(salesHistory(items, { query: "RECEIVER", platformId: null }).sales).toBe(2);
    expect(salesHistory(items, { query: "audio", platformId: null }).sales).toBe(3);
    expect(salesHistory(items, { query: "receiver", platformId: shop.id })).toMatchObject({
      sales: 1,
      medianSaleCents: 20_000,
      medianMargin: null,
      pricedSales: 0,
      feePercent: null,
      medianShippingCents: null,
      medianRepairCents: 500,
    });
  });

  it("is empty when nothing matches", () => {
    expect(salesHistory(items, { query: "piano", platformId: null })).toEqual({
      sales: 0,
      medianSaleCents: null,
      medianMargin: null,
      pricedSales: 0,
      feePercent: null,
      medianShippingCents: null,
      medianRepairCents: null,
      medianDaysHeld: null,
    });
  });
});

describe("historyInputs", () => {
  const history = salesHistory([sold(1, { costs: [{ kind: "fees", amountCents: 1_300 }] })], {
    query: "",
    platformId: null,
  });

  it("suggests the numbers the history has", () => {
    // $100 sale, $40 paid, $13 fees: a 47% margin.
    expect(historyInputs(history)).toEqual({
      saleCents: 10_000,
      feePercent: 13,
      marginPercent: 47,
    });
  });

  it("leaves the margin alone after losses", () => {
    expect(historyInputs({ ...history, medianMargin: -0.2 })).not.toHaveProperty("marginPercent");
  });
});
