import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveYieldTargets,
  getNotificationRulesForStock,
  getNotifications
} from "./queries";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

function createMockQuery(result: any) {
  const self: any = {
    select: vi.fn(() => self),
    insert: vi.fn(() => self),
    update: vi.fn(() => self),
    eq: vi.fn(() => self),
    in: vi.fn(() => self),
    order: vi.fn(() => self),
    limit: vi.fn(() => self),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject)
  };
  return self;
}

function createMockSupabase(result: any) {
  const query = createMockQuery(result);
  return {
    from: vi.fn(() => query),
    auth: { getUser: vi.fn() }
  };
}

let mockSupabase: ReturnType<typeof createMockSupabase>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase = createMockSupabase({ data: [], error: null });
  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
});

describe("getNotificationRulesForStock", () => {
  it("returns rules for a stock", async () => {
    const rules = [
      { id: "1", stock_id: "stock-1", basis: "before_tax_yield" }
    ];
    const query = createMockQuery({ data: rules, error: null });
    mockSupabase.from.mockReturnValue(query);

    const result = await getNotificationRulesForStock("stock-1");
    expect(result).toEqual(rules);
    expect(mockSupabase.from).toHaveBeenCalledWith("notification_rules");
    expect(query.select).toHaveBeenCalledWith("*");
    expect(query.eq).toHaveBeenCalledWith("stock_id", "stock-1");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns empty array when data is null", async () => {
    const query = createMockQuery({ data: null, error: null });
    mockSupabase.from.mockReturnValue(query);

    const result = await getNotificationRulesForStock("stock-1");
    expect(result).toEqual([]);
  });

  it("throws when database returns an error", async () => {
    const query = createMockQuery({ data: null, error: { message: "DB fail" } });
    mockSupabase.from.mockReturnValue(query);

    await expect(getNotificationRulesForStock("stock-1")).rejects.toThrow(
      "DB fail"
    );
  });
});

describe("getActiveYieldTargets", () => {
  it("returns active yield targets with stock data", async () => {
    const rows = [
      {
        id: "rule-1",
        stock_id: "stock-1",
        operator: "gte",
        target_yield: 3.5,
        stocks: {
          id: "stock-1",
          name: "Test Stock",
          ticker: "TEST",
          expected_dividend_yield: 4.2
        }
      }
    ];
    const query = createMockQuery({ data: rows, error: null });
    mockSupabase.from.mockReturnValue(query);

    const result = await getActiveYieldTargets();

    expect(result).toEqual([
      {
        ruleId: "rule-1",
        stockId: "stock-1",
        stockName: "Test Stock",
        ticker: "TEST",
        operator: "gte",
        targetYield: 3.5,
        expectedDividendYield: 4.2
      }
    ]);
    expect(mockSupabase.from).toHaveBeenCalledWith("notification_rules");
    expect(query.select).toHaveBeenCalledWith(
      "id, stock_id, operator, target_yield, stocks(id, name, ticker, expected_dividend_yield)"
    );
    expect(query.eq).toHaveBeenCalledWith("status", "active");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns empty array when active yield target data is null", async () => {
    const query = createMockQuery({ data: null, error: null });
    mockSupabase.from.mockReturnValue(query);

    const result = await getActiveYieldTargets();

    expect(result).toEqual([]);
  });

  it("throws when database returns an error", async () => {
    const query = createMockQuery({ data: null, error: { message: "DB fail" } });
    mockSupabase.from.mockReturnValue(query);

    await expect(getActiveYieldTargets()).rejects.toThrow("DB fail");
  });
});

describe("getNotifications", () => {
  it("returns notifications with no additional filter", async () => {
    const notifications = [
      { id: "1", type: "yield_target", stocks: { ticker: "AAPL", name: "Apple" } }
    ];
    const query = createMockQuery({ data: notifications, error: null });
    mockSupabase.from.mockReturnValue(query);

    const result = await getNotifications("all");
    expect(result).toEqual(notifications);
    expect(mockSupabase.from).toHaveBeenCalledWith("notifications");
    expect(query.select).toHaveBeenCalledWith("*, stocks(ticker, name)");
    expect(query.eq).toHaveBeenCalledWith("channel", "in_app");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it("filters by yield_target", async () => {
    const query = createMockQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await getNotifications("yield_target");
    expect(query.eq).toHaveBeenCalledWith("type", "yield_target");
  });

  it("filters by data_update", async () => {
    const query = createMockQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await getNotifications("data_update");
    expect(query.eq).toHaveBeenCalledWith("type", "data_update");
  });

  it("filters by dividend_change", async () => {
    const query = createMockQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await getNotifications("dividend_change");
    expect(query.in).toHaveBeenCalledWith("type", [
      "dividend_increase",
      "dividend_decrease",
      "no_dividend",
      "special_dividend"
    ]);
  });

  it("returns empty array when data is null", async () => {
    const query = createMockQuery({ data: null, error: null });
    mockSupabase.from.mockReturnValue(query);

    const result = await getNotifications("all");
    expect(result).toEqual([]);
  });

  it("throws when database returns an error", async () => {
    const query = createMockQuery({ data: null, error: { message: "DB fail" } });
    mockSupabase.from.mockReturnValue(query);

    await expect(getNotifications("all")).rejects.toThrow("DB fail");
  });
});
