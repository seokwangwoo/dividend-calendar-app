import { describe, expect, it } from "vitest";
import {
  calculateCurrentYield,
  isWithinDeduplicationWindow,
  ruleMatches,
  formatRuleCondition,
  getTaxRateForAccountType,
  evaluateYieldRuleTransition,
  shouldSendDividendChangeNotification
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

  describe("evaluateYieldRuleTransition", () => {
    const baseParams = {
      expectedAnnualDividendPerShare: 100,
      currentPrice: 2000,
      basis: "before_tax_yield" as const,
      accountType: "nisa" as const,
      targetYield: 4,
      operator: "gte" as const,
      staleThresholdHours: 48
    };

    it("skips evaluation when price is stale (>48h)", () => {
      const staleDate = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
      const result = evaluateYieldRuleTransition({
        ...baseParams,
        priceUpdatedAt: staleDate,
        lastConditionMet: false
      });
      expect(result.action).toBe("skip_stale");
    });

    it("skips evaluation when price_updated_at is null", () => {
      const result = evaluateYieldRuleTransition({
        ...baseParams,
        priceUpdatedAt: null,
        lastConditionMet: false
      });
      expect(result.action).toBe("skip_stale");
    });

    it("fires on false-to-true transition with fresh price", () => {
      const freshDate = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const result = evaluateYieldRuleTransition({
        ...baseParams,
        priceUpdatedAt: freshDate,
        lastConditionMet: false
      });
      expect(result.action).toBe("transition_to_met");
      expect(result.lastConditionMet).toBe(true);
    });

    it("does not fire on true-to-true transition", () => {
      const freshDate = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const result = evaluateYieldRuleTransition({
        ...baseParams,
        priceUpdatedAt: freshDate,
        lastConditionMet: true
      });
      expect(result.action).toBe("no_change");
      expect(result.lastConditionMet).toBe(true);
    });

    it("transitions to false on true-to-false with fresh price", () => {
      const freshDate = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const result = evaluateYieldRuleTransition({
        ...baseParams,
        currentPrice: 3000, // yield drops to ~3.33%
        priceUpdatedAt: freshDate,
        lastConditionMet: true
      });
      expect(result.action).toBe("transition_to_unmet");
      expect(result.lastConditionMet).toBe(false);
    });

    it("does not fire on false-to-false transition", () => {
      const freshDate = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const result = evaluateYieldRuleTransition({
        ...baseParams,
        currentPrice: 3000,
        priceUpdatedAt: freshDate,
        lastConditionMet: false
      });
      expect(result.action).toBe("no_change");
      expect(result.lastConditionMet).toBe(false);
    });

    it("skips when missing yield data", () => {
      const freshDate = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      const result = evaluateYieldRuleTransition({
        ...baseParams,
        expectedAnnualDividendPerShare: null,
        priceUpdatedAt: freshDate,
        lastConditionMet: false
      });
      expect(result.action).toBe("skip_missing_yield");
    });

    it("keeps lastConditionMet unchanged on stale skip", () => {
      const staleDate = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
      const result = evaluateYieldRuleTransition({
        ...baseParams,
        priceUpdatedAt: staleDate,
        lastConditionMet: true
      });
      expect(result.action).toBe("skip_stale");
      expect(result.lastConditionMet).toBe(true);
    });
  });

  describe("shouldSendDividendChangeNotification", () => {
    it("allows notification when user holds the stock and no duplicate exists", () => {
      const result = shouldSendDividendChangeNotification({
        userHasActiveHolding: true,
        existingNotificationForEvent: false
      });
      expect(result.shouldSend).toBe(true);
      expect(result.reason).toBe("ok");
    });

    it("blocks notification when user does not hold the stock", () => {
      const result = shouldSendDividendChangeNotification({
        userHasActiveHolding: false,
        existingNotificationForEvent: false
      });
      expect(result.shouldSend).toBe(false);
      expect(result.reason).toBe("no_holding");
    });

    it("blocks duplicate notification for the same user, stock, and event", () => {
      const result = shouldSendDividendChangeNotification({
        userHasActiveHolding: true,
        existingNotificationForEvent: true
      });
      expect(result.shouldSend).toBe(false);
      expect(result.reason).toBe("already_notified");
    });
  });
});
