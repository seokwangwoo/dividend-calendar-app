import { describe, expect, it, vi, beforeEach } from "vitest";
import { searchStocks, getStockById } from "./queries";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn()
}));

describe("searchStocks", () => {
  const mockSupabase = {
    from: vi.fn(() => mockSupabase),
    select: vi.fn(() => mockSupabase),
    or: vi.fn(() => mockSupabase),
    order: vi.fn(() => mockSupabase),
    limit: vi.fn(() => mockSupabase)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it("returns empty array for empty query", async () => {
    const result = await searchStocks("   ");
    expect(result).toEqual([]);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns empty array for empty string query", async () => {
    const result = await searchStocks("");
    expect(result).toEqual([]);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns stocks on successful search", async () => {
    const mockData = [
      { id: "1", ticker: "AAPL", name: "Apple Inc.", name_en: "Apple" },
      { id: "2", ticker: "GOOGL", name: "Alphabet Inc.", name_en: "Alphabet" }
    ];
    mockSupabase.limit.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await searchStocks("AAPL");

    expect(createClient).toHaveBeenCalled();
    expect(mockSupabase.from).toHaveBeenCalledWith("stocks");
    expect(mockSupabase.select).toHaveBeenCalledWith("*");
    expect(mockSupabase.or).toHaveBeenCalledWith(
      "ticker.ilike.%AAPL%,name.ilike.%AAPL%,name_en.ilike.%AAPL%"
    );
    expect(mockSupabase.order).toHaveBeenCalledWith("support_status", { ascending: true });
    expect(mockSupabase.order).toHaveBeenCalledWith("ticker", { ascending: true });
    expect(mockSupabase.limit).toHaveBeenCalledWith(20);
    expect(result).toEqual(mockData);
  });

  it("returns empty array when data is null", async () => {
    mockSupabase.limit.mockResolvedValueOnce({ data: null, error: null });

    const result = await searchStocks("AAPL");

    expect(result).toEqual([]);
  });

  it("throws error on supabase error", async () => {
    mockSupabase.limit.mockResolvedValueOnce({ data: null, error: { message: "Database error" } });

    await expect(searchStocks("AAPL")).rejects.toThrow("Database error");
  });
});

describe("getStockById", () => {
  const mockSupabase = {
    from: vi.fn(() => mockSupabase),
    select: vi.fn(() => mockSupabase),
    eq: vi.fn(() => mockSupabase),
    single: vi.fn(() => mockSupabase)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it("returns stock when found", async () => {
    const mockData = { id: "1", ticker: "AAPL", name: "Apple Inc.", name_en: "Apple" };
    mockSupabase.single.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await getStockById("1");

    expect(createClient).toHaveBeenCalled();
    expect(mockSupabase.from).toHaveBeenCalledWith("stocks");
    expect(mockSupabase.select).toHaveBeenCalledWith("*");
    expect(mockSupabase.eq).toHaveBeenCalledWith("id", "1");
    expect(mockSupabase.single).toHaveBeenCalled();
    expect(result).toEqual(mockData);
  });

  it("returns null when stock not found (PGRST116)", async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST116", message: "Not found" }
    });

    const result = await getStockById("999");

    expect(result).toBeNull();
  });

  it("throws error on other supabase errors", async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST999", message: "Unexpected error" }
    });

    await expect(getStockById("1")).rejects.toThrow("Unexpected error");
  });
});
