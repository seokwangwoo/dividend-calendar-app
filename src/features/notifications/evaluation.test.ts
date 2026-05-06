import { describe, expect, it } from "vitest";
import {
  calculateCurrentYield,
  isWithinDeduplicationWindow,
  ruleMatches,
  formatRuleCondition,
  getTaxRateForAccountType
} from "@/features/notifications/evaluation";

describe("notification rule evaluation", () => {
  describe("getTaxRateForAccountType", () => {
    it("returns 0 for nisa", () => {
      expect(getTaxRateForAccountType("nisa")).toBe(0);
    });

    it("returns 20.315% for tokutei", () => {
      expect(getTaxRateForAccountType("tokutei")).toBeCloseTo(0.20315);
    });

    it("returns 20.315% for general", () => {
      expect(getTaxRateForAccountType("general")).toBeCloseTo(0.20315);
    });
  });

  describe("calculateCurrentYield", () => {
    it("calculates before-tax and after-tax yields", () => {
      const base = {
        expectedAnnualDividendPerShare: 100,
        currentPrice: 2000,
        accountType: "tokutei" as const
      };

      expect(
        calculateCurrentYield({ ...base, basis: "before_tax_yield" })
      ).toBeCloseTo(5);
      expect(
        calculateCurrentYield({ ...base, basis: "after_tax_yield" })
      ).toBeCloseTo(3.98425);
    });

    it("returns null when expectedAnnualDividendPerShare is null", () => {
      expect(
        calculateCurrentYield({
          expectedAnnualDividendPerShare: null,
          currentPrice: 2000,
          basis: "before_tax_yield",
          accountType: "nisa"
        })
      ).toBeNull();
    });

    it("returns null when currentPrice is null", () => {
      expect(
        calculateCurrentYield({
          expectedAnnualDividendPerShare: 100,
          currentPrice: null,
          basis: "before_tax_yield",
          accountType: "nisa"
        })
      ).toBeNull();
    });

    it("returns null when currentPrice is 0", () => {
      expect(
        calculateCurrentYield({
          expectedAnnualDividendPerShare: 100,
          currentPrice: 0,
          basis: "before_tax_yield",
          accountType: "nisa"
        })
      ).toBeNull();
    });

    it("returns null when currentPrice is negative", () => {
      expect(
        calculateCurrentYield({
          expectedAnnualDividendPerShare: 100,
          currentPrice: -100,
          basis: "before_tax_yield",
          accountType: "nisa"
        })
      ).toBeNull();
    });
  });

  describe("ruleMatches", () => {
    it("matches gte and lte operators", () => {
      expect(ruleMatches({ evaluatedYield: 3.7, targetYield: 3.5, operator: "gte" })).toBe(
        true
      );
      expect(ruleMatches({ evaluatedYield: 3.7, targetYield: 4, operator: "gte" })).toBe(
        false
      );
      expect(ruleMatches({ evaluatedYield: 1.8, targetYield: 2, operator: "lte" })).toBe(
        true
      );
      expect(ruleMatches({ evaluatedYield: 2.5, targetYield: 2, operator: "lte" })).toBe(
        false
      );
    });
  });

  describe("isWithinDeduplicationWindow", () => {
    it("blocks duplicates within 24 hours", () => {
      const now = new Date("2026-05-06T12:00:00Z");

      expect(
        isWithinDeduplicationWindow("2026-05-05T13:00:00Z", now)
      ).toBe(true);
      expect(
        isWithinDeduplicationWindow("2026-05-05T11:00:00Z", now)
      ).toBe(false);
    });

    it("returns false when lastTriggeredAt is null", () => {
      const now = new Date("2026-05-06T12:00:00Z");
      expect(isWithinDeduplicationWindow(null, now)).toBe(false);
    });

    it("returns false for invalid date string", () => {
      const now = new Date("2026-05-06T12:00:00Z");
      expect(isWithinDeduplicationWindow("invalid-date", now)).toBe(false);
    });
  });

  describe("formatRuleCondition", () => {
    it("formats gte condition", () => {
      expect(formatRuleCondition({ targetYield: 3.5, operator: "gte" })).toBe("3.5%以上");
    });

    it("formats lte condition", () => {
      expect(formatRuleCondition({ targetYield: 2.0, operator: "lte" })).toBe("2.0%以下");
    });
  });
});
