import { describe, expect, it, vi, beforeEach } from "vitest";
import { searchStocksAction } from "./actions";
import * as queries from "./queries";

vi.mock("./queries", () => ({
  searchStocks: vi.fn()
}));

describe("searchStocksAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns search results on success", async () => {
    const mockResults = [
      { id: "1", ticker: "AAPL", name: "Apple Inc.", name_en: "Apple" },
      { id: "2", ticker: "GOOGL", name: "Alphabet Inc.", name_en: "Alphabet" }
    ];
    vi.mocked(queries.searchStocks).mockResolvedValue(mockResults as any);

    const result = await searchStocksAction("AAPL");

    expect(queries.searchStocks).toHaveBeenCalledWith("AAPL");
    expect(result).toEqual(mockResults);
  });

  it("returns empty array when query has no results", async () => {
    vi.mocked(queries.searchStocks).mockResolvedValue([]);

    const result = await searchStocksAction("XYZ");

    expect(queries.searchStocks).toHaveBeenCalledWith("XYZ");
    expect(result).toEqual([]);
  });

  it("propagates errors from searchStocks", async () => {
    const error = new Error("Database connection failed");
    vi.mocked(queries.searchStocks).mockRejectedValue(error);

    await expect(searchStocksAction("AAPL")).rejects.toThrow("Database connection failed");
    expect(queries.searchStocks).toHaveBeenCalledWith("AAPL");
  });
});
