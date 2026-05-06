import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";
import {
  getHoldings,
  getHoldingById,
  getPortfolioSummary
} from "./queries";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn()
}));

let nextResult: { data: any; error: any } = { data: null, error: null };

// Thenable query builder so `await query` works at the end of a chain
const queryBuilder: any = {
  select: vi.fn(() => queryBuilder),
  eq: vi.fn(() => queryBuilder),
  order: vi.fn(() => queryBuilder),
  is: vi.fn(() => queryBuilder),
  single: vi.fn(() => Promise.resolve(nextResult)),
  then(onFulfilled: any, onRejected?: any) {
    return Promise.resolve(nextResult).then(onFulfilled, onRejected);
  }
};

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(() => queryBuilder),
  rpc: vi.fn(() => Promise.resolve(nextResult))
};

beforeEach(() => {
  vi.clearAllMocks();
  nextResult = { data: null, error: null };
  vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
});

describe("getHoldings", () => {
  const holdingData = [
    { id: "h1", stock: { id: "s1", ticker: "AAPL" } },
    { id: "h2", stock: { id: "s2", ticker: "MSFT" } }
  ];

  it("throws on query error", async () => {
    nextResult = { data: null, error: { message: "Query failed" } };
    await expect(getHoldings()).rejects.toThrow("Query failed");
    expect(mockSupabase.from).toHaveBeenCalledWith("holdings");
    expect(queryBuilder.select).toHaveBeenCalledWith("*, stock:stocks(*)");
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(queryBuilder.order).toHaveBeenCalledWith("created_at", {
      ascending: false
    });
  });

  it("returns holdings without accountType filter", async () => {
    nextResult = { data: holdingData, error: null };
    const result = await getHoldings();
    expect(result).toEqual(holdingData);
    expect(queryBuilder.eq).not.toHaveBeenCalledWith(
      "account_type",
      expect.any(String)
    );
  });

  it("filters by accountType when provided", async () => {
    nextResult = { data: holdingData, error: null };
    const result = await getHoldings("nisa");
    expect(result).toEqual(holdingData);
    expect(queryBuilder.eq).toHaveBeenCalledWith("account_type", "nisa");
  });

  it("does not filter when accountType is 'all'", async () => {
    nextResult = { data: holdingData, error: null };
    const result = await getHoldings("all");
    expect(result).toEqual(holdingData);
    expect(queryBuilder.eq).not.toHaveBeenCalledWith(
      "account_type",
      expect.any(String)
    );
  });
});

describe("getHoldingById", () => {
  const holding = { id: "h1", stock: { id: "s1", ticker: "AAPL" } };

  it("returns null when holding not found (PGRST116)", async () => {
    nextResult = { data: null, error: { code: "PGRST116", message: "No rows" } };
    const result = await getHoldingById("h1");
    expect(result).toBeNull();
    expect(mockSupabase.from).toHaveBeenCalledWith("holdings");
    expect(queryBuilder.select).toHaveBeenCalledWith("*, stock:stocks(*)");
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "h1");
    expect(queryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("throws on other errors", async () => {
    nextResult = { data: null, error: { code: "OTHER", message: "DB error" } };
    await expect(getHoldingById("h1")).rejects.toThrow("DB error");
  });

  it("returns holding when found", async () => {
    nextResult = { data: holding, error: null };
    const result = await getHoldingById("h1");
    expect(result).toEqual(holding);
  });
});

describe("getPortfolioSummary", () => {
  const rpcRow = {
    holding_count: 3,
    annual_before_tax_amount: 10000,
    annual_estimated_tax_amount: 2000,
    annual_after_tax_amount: 8000,
    average_after_tax_yield: 2.5,
    currency: "USD"
  };

  it("throws on rpc error", async () => {
    nextResult = { data: null, error: { message: "RPC failed" } };
    await expect(getPortfolioSummary()).rejects.toThrow("RPC failed");
    expect(mockSupabase.rpc).toHaveBeenCalledWith("get_portfolio_summary", {
      p_account_type: null
    });
  });

  it("returns summary with default values when data is empty", async () => {
    nextResult = { data: [], error: null };
    const result = await getPortfolioSummary();
    expect(result).toEqual({
      holdingCount: 0,
      annualBeforeTaxAmount: null,
      annualEstimatedTaxAmount: null,
      annualAfterTaxAmount: null,
      averageAfterTaxYield: null,
      currency: "JPY"
    });
  });

  it("passes accountType to rpc when provided", async () => {
    nextResult = { data: [rpcRow], error: null };
    await getPortfolioSummary("nisa");
    expect(mockSupabase.rpc).toHaveBeenCalledWith("get_portfolio_summary", {
      p_account_type: "nisa"
    });
  });

  it("passes null when accountType is 'all'", async () => {
    nextResult = { data: [rpcRow], error: null };
    await getPortfolioSummary("all");
    expect(mockSupabase.rpc).toHaveBeenCalledWith("get_portfolio_summary", {
      p_account_type: null
    });
  });

  it("returns mapped summary from rpc row", async () => {
    nextResult = { data: [rpcRow], error: null };
    const result = await getPortfolioSummary();
    expect(result).toEqual({
      holdingCount: 3,
      annualBeforeTaxAmount: 10000,
      annualEstimatedTaxAmount: 2000,
      annualAfterTaxAmount: 8000,
      averageAfterTaxYield: 2.5,
      currency: "USD"
    });
  });

  it("handles null fields in rpc row", async () => {
    nextResult = {
      data: [
        {
          holding_count: 0,
          annual_before_tax_amount: null,
          annual_estimated_tax_amount: null,
          annual_after_tax_amount: null,
          average_after_tax_yield: null,
          currency: null
        }
      ],
      error: null
    };
    const result = await getPortfolioSummary();
    expect(result).toEqual({
      holdingCount: 0,
      annualBeforeTaxAmount: null,
      annualEstimatedTaxAmount: null,
      annualAfterTaxAmount: null,
      averageAfterTaxYield: null,
      currency: "JPY"
    });
  });
});
