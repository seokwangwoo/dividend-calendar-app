import { describe, expect, it } from "vitest";
import { sortHoldings } from "@/features/holdings/sort";

describe("sortHoldings", () => {
  const base = {
    id: "1",
    quantity: 100,
    average_purchase_price: 1000,
    account_type: "nisa" as const
  };

  const holdings = [
    {
      ...base,
      id: "1",
      ticker: "2914",
      created_at: "2026-01-01T00:00:00Z",
      annualAfterTaxAmount: 50000
    },
    {
      ...base,
      id: "2",
      ticker: "9433",
      created_at: "2026-03-01T00:00:00Z",
      annualAfterTaxAmount: 120000
    },
    {
      ...base,
      id: "3",
      ticker: "7203",
      created_at: "2026-02-01T00:00:00Z",
      annualAfterTaxAmount: 30000
    }
  ];

  it("sorts by annual_after_tax_desc highest first", () => {
    const result = sortHoldings(holdings, "annual_after_tax_desc");
    expect(result.map((h) => h.id)).toEqual(["2", "1", "3"]);
  });

  it("sorts by ticker_asc", () => {
    const result = sortHoldings(holdings, "ticker_asc");
    expect(result.map((h) => h.id)).toEqual(["1", "3", "2"]);
  });

  it("sorts by recently_added newest first", () => {
    const result = sortHoldings(holdings, "recently_added");
    expect(result.map((h) => h.id)).toEqual(["2", "3", "1"]);
  });

  it("preserves all fields without mutation", () => {
    const original = [...holdings];
    const result = sortHoldings(holdings, "ticker_asc");
    expect(result[0]).toHaveProperty("quantity");
    expect(result[0]).toHaveProperty("average_purchase_price");
    expect(holdings).toEqual(original);
  });

  it("returns empty array for empty input", () => {
    expect(sortHoldings([], "annual_after_tax_desc")).toEqual([]);
    expect(sortHoldings([], "ticker_asc")).toEqual([]);
    expect(sortHoldings([], "recently_added")).toEqual([]);
  });
});
