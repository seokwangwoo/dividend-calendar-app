import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getHomeSummary,
  getDividendCalendar,
  getDividendMonthDetail,
  getStockDetail
} from "./queries";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn()
}));

describe("getHomeSummary", () => {
  const mockSupabase = {
    rpc: vi.fn(() => mockSupabase)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it("returns HomeSummary on success", async () => {
    const mockData = {
      totalDividends: 100000,
      totalEvents: 12,
      year: 2024
    };
    mockSupabase.rpc.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await getHomeSummary(2024);

    expect(createClient).toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("get_home_summary", { p_year: 2024 });
    expect(result).toEqual(mockData);
  });

  it("returns null when data is null", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await getHomeSummary(2024);

    expect(result).toBeNull();
  });

  it("throws error when supabase returns an error", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "RPC failed" } });

    await expect(getHomeSummary(2024)).rejects.toThrow("RPC failed");
  });

  it("returns nextDividend already sorted by payment date, estimated month, and after-tax amount", async () => {
    const mockData = {
      year: 2026,
      holdingCount: 1,
      nextDividend: {
        ticker: "9433",
        stockName: "KDDI",
        displayDateText: "2026年06月15日",
        beforeTaxAmount: 29000,
        afterTaxAmount: 29000,
        status: "confirmed"
      }
    };
    mockSupabase.rpc.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await getHomeSummary(2026);

    expect(result?.nextDividend).toEqual(mockData.nextDividend);
  });

  it("returns nextDividend with same-stock multi-account after-tax sum", async () => {
    const mockData = {
      year: 2026,
      holdingCount: 2,
      nextDividend: {
        ticker: "9433",
        stockName: "KDDI",
        displayDateText: "6月予定",
        beforeTaxAmount: 30000,
        afterTaxAmount: 26952.75,
        status: "estimated"
      }
    };
    mockSupabase.rpc.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await getHomeSummary(2026);

    expect(result?.nextDividend?.beforeTaxAmount).toBe(30000);
    expect(result?.nextDividend?.afterTaxAmount).toBe(26952.75);
  });

  it("returns only approved-event user-facing results from the RPC response", async () => {
    const mockData = {
      year: 2026,
      holdingCount: 1,
      annualDividend: {
        beforeTaxAmount: null,
        estimatedTaxAmount: null,
        afterTaxAmount: null,
        currency: "JPY"
      },
      currentMonthDividend: { month: 5, afterTaxAmount: null },
      nextDividend: null,
      annualGoal: null,
      recentDividendChange: null
    };
    mockSupabase.rpc.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await getHomeSummary(2026);

    expect(result).toEqual(mockData);
    expect(result?.nextDividend).toBeNull();
    expect(result?.annualDividend.afterTaxAmount).toBeNull();
  });
});

describe("getDividendCalendar", () => {
  const mockSupabase = {
    rpc: vi.fn(() => mockSupabase)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it("returns mapped CalendarMonth array on success", async () => {
    const mockData = [
      { month: 1, amount: 10000, event_count: 2 },
      { month: 2, amount: null, event_count: 0 },
      { month: 3, amount: 25000.5, event_count: 5 }
    ];
    mockSupabase.rpc.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await getDividendCalendar(2024, "before_tax", "all");

    expect(createClient).toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("get_dividend_calendar", {
      p_year: 2024,
      p_basis: "before_tax",
      p_account_type: "all"
    });
    expect(result).toEqual([
      { month: 1, amount: 10000, eventCount: 2 },
      { month: 2, amount: null, eventCount: 0 },
      { month: 3, amount: 25000.5, eventCount: 5 }
    ]);
  });

  it("returns empty array when data is null", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await getDividendCalendar(2024, "after_tax", "nisa");

    expect(result).toEqual([]);
  });

  it("returns empty array when data is falsy", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: undefined, error: null });

    const result = await getDividendCalendar(2024, "after_tax", "nisa");

    expect(result).toEqual([]);
  });

  it("throws error when supabase returns an error", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "Calendar error" } });

    await expect(getDividendCalendar(2024, "before_tax", "all")).rejects.toThrow("Calendar error");
  });
});

describe("getDividendMonthDetail", () => {
  const mockSupabase = {
    rpc: vi.fn(() => mockSupabase)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it("returns MonthDetail on success", async () => {
    const mockData = {
      month: 6,
      year: 2024,
      totalAmount: 50000,
      events: []
    };
    mockSupabase.rpc.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await getDividendMonthDetail(2024, 6, "before_tax", "all");

    expect(createClient).toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("get_dividend_month_detail", {
      p_year: 2024,
      p_month: 6,
      p_basis: "before_tax",
      p_account_type: "all"
    });
    expect(result).toEqual(mockData);
  });

  it("returns null when data is null", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await getDividendMonthDetail(2024, 6, "after_tax", "nisa");

    expect(result).toBeNull();
  });

  it("throws error when supabase returns an error", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "Month detail error" } });

    await expect(getDividendMonthDetail(2024, 6, "before_tax", "all")).rejects.toThrow("Month detail error");
  });
});

describe("getStockDetail", () => {
  const mockSupabase = {
    rpc: vi.fn(() => mockSupabase)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it("returns StockDetail on success", async () => {
    const mockData = {
      id: "stock-1",
      ticker: "AAPL",
      name: "Apple Inc.",
      dividends: []
    };
    mockSupabase.rpc.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await getStockDetail("stock-1");

    expect(createClient).toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("get_stock_detail", {
      p_stock_id: "stock-1",
      p_year: expect.any(Number)
    });
    expect(result).toEqual(mockData);
  });

  it("passes selected payment year to stock detail rpc", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: { stock: { id: "stock-1" } }, error: null });

    await getStockDetail("stock-1", 2026);

    expect(mockSupabase.rpc).toHaveBeenCalledWith("get_stock_detail", {
      p_stock_id: "stock-1",
      p_year: 2026
    });
  });

  it("returns null when data is null", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

    const result = await getStockDetail("stock-999");

    expect(result).toBeNull();
  });

  it("throws error when supabase returns an error", async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "Stock detail error" } });

    await expect(getStockDetail("stock-1")).rejects.toThrow("Stock detail error");
  });
});
