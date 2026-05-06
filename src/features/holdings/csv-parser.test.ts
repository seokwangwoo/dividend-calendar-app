import { describe, expect, it } from "vitest";
import {
  parseCsvHoldings,
  normalizeAccountType
} from "@/features/holdings/csv-parser";

const supportedTickers = new Set(["9433", "2914", "7203"]);
const isSupported = (ticker: string) => supportedTickers.has(ticker);
const isSupportedAsync = async (ticker: string) => supportedTickers.has(ticker);

describe("csv-parser", () => {
  describe("normalizeAccountType", () => {
    it("normalizes NISA to nisa", () => {
      expect(normalizeAccountType("NISA")).toEqual({ value: "nisa" });
    });

    it("normalizes tokutei to tokutei", () => {
      expect(normalizeAccountType("tokutei")).toEqual({ value: "tokutei" });
    });

    it("rejects unsupported alias with clear error", () => {
      const result = normalizeAccountType("foo");
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toContain("未対応");
      }
    });
  });

  describe("parseCsvHoldings", () => {
    it("parses valid row 9433,100,4300,nisa", async () => {
      const result = await parseCsvHoldings("9433,100,4300,nisa", isSupported);
      expect(result.validRows).toHaveLength(1);
      expect(result.validRows[0]).toEqual({
        ticker: "9433",
        quantity: 100,
        averagePurchasePrice: 4300,
        accountType: "nisa"
      });
      expect(result.errors).toHaveLength(0);
    });

    it("skips header row", async () => {
      const result = await parseCsvHoldings(
        "ticker,quantity,average_purchase_price,account_type\n9433,100,4300,nisa",
        isSupported
      );
      expect(result.validRows).toHaveLength(1);
      expect(result.validRows[0].ticker).toBe("9433");
    });

    it("returns error for negative quantity", async () => {
      const result = await parseCsvHoldings("9433,-10,4300,nisa", isSupported);
      expect(result.validRows).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("数量は正の数値");
    });

    it("returns error for zero average purchase price", async () => {
      const result = await parseCsvHoldings("9433,100,0,nisa", isSupported);
      expect(result.validRows).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("平均取得単価は正の数値");
    });

    it("returns error for unsupported ticker", async () => {
      const result = await parseCsvHoldings("9999,100,4300,nisa", isSupported);
      expect(result.validRows).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("サポートされていません");
    });

    it("returns error for row with too few columns", async () => {
      const result = await parseCsvHoldings("9433,100", isSupported);
      expect(result.validRows).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("列数が不足");
    });

    it("returns empty result for empty body", async () => {
      const result = await parseCsvHoldings("", isSupported);
      expect(result.validRows).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("parses memo when present", async () => {
      const result = await parseCsvHoldings(
        "9433,100,4300,nisa,メモ",
        isSupported
      );
      expect(result.validRows[0].memo).toBe("メモ");
    });

    it("processes multiple rows and separates valid from invalid", async () => {
      const csv = `9433,100,4300,nisa
2914,200,3100,tokutei
9999,100,4300,nisa
9433,-5,4300,nisa`;
      const result = await parseCsvHoldings(csv, isSupported);
      expect(result.validRows).toHaveLength(2);
      expect(result.errors).toHaveLength(2);
    });

    it("supports async isTickerSupported", async () => {
      const result = await parseCsvHoldings("9433,100,4300,nisa", isSupportedAsync);
      expect(result.validRows).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });
  });
});
