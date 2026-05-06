import { describe, expect, it } from "vitest";
import {
  normalizeStooqTicker,
  parseStooqCsvRow,
  parseStooqCsv
} from "@/features/stocks/stooq-parser";

describe("stooq parser", () => {
  describe("normalizeStooqTicker", () => {
    it("normalizes 9433.JP to 9433", () => {
      expect(normalizeStooqTicker("9433.JP")).toBe("9433");
    });

    it("normalizes lowercase 9433.jp to 9433", () => {
      expect(normalizeStooqTicker("9433.jp")).toBe("9433");
    });

    it("returns null for non-JP suffix", () => {
      expect(normalizeStooqTicker("AAPL.US")).toBeNull();
    });

    it("returns null for invalid format", () => {
      expect(normalizeStooqTicker("9433")).toBeNull();
    });
  });

  describe("parseStooqCsvRow", () => {
    it("parses valid row with date and close price", () => {
      const row = parseStooqCsvRow("9433.JP,2026-05-05,4200,4250,4180,4230,1000000", "2026-05-05");
      expect(row).not.toBeNull();
      expect(row?.ticker).toBe("9433");
      expect(row?.price).toBe(4230);
      expect(row?.updatedAt).toBeInstanceOf(Date);
    });

    it("returns null when close price is missing", () => {
      const row = parseStooqCsvRow("9433.JP,2026-05-05,4200,4250,4180,,1000000", "2026-05-05");
      expect(row).toBeNull();
    });

    it("returns null when close price is non-numeric", () => {
      const row = parseStooqCsvRow("9433.JP,2026-05-05,4200,4250,4180,abc,1000000", "2026-05-05");
      expect(row).toBeNull();
    });

    it("returns null when date does not match expected", () => {
      const row = parseStooqCsvRow("9433.JP,2026-05-04,4200,4250,4180,4230,1000000", "2026-05-05");
      expect(row).toBeNull();
    });

    it("returns null for empty line", () => {
      expect(parseStooqCsvRow("", "2026-05-05")).toBeNull();
    });

    it("returns null for whitespace-only line", () => {
      expect(parseStooqCsvRow("   ", "2026-05-05")).toBeNull();
    });
  });

  describe("parseStooqCsv", () => {
    it("parses multiple valid rows and skips header", () => {
      const csv = `Symbol,Date,Open,High,Low,Close,Volume
9433.JP,2026-05-05,4200,4250,4180,4230,1000000
2914.JP,2026-05-05,3100,3150,3090,3120,500000`;
      const result = parseStooqCsv(csv, "2026-05-05");
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].ticker).toBe("9433");
      expect(result.rows[1].ticker).toBe("2914");
      expect(result.skipped).toBe(0);
    });

    it("returns empty result for empty CSV body", () => {
      const result = parseStooqCsv("", "2026-05-05");
      expect(result.rows).toHaveLength(0);
      expect(result.skipped).toBe(0);
    });

    it("skips rows with missing or non-numeric close price", () => {
      const csv = `Symbol,Date,Open,High,Low,Close,Volume
9433.JP,2026-05-05,4200,4250,4180,4230,1000000
INVALID,2026-05-05,1,2,3,abc,100
`;
      const result = parseStooqCsv(csv, "2026-05-05");
      expect(result.rows).toHaveLength(1);
      expect(result.skipped).toBe(1);
    });
  });
});
