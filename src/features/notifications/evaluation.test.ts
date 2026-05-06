import { describe, expect, it } from "vitest";
import {
  calculateCurrentYield,
  isWithinDeduplicationWindow,
  ruleMatches
} from "@/features/notifications/evaluation";

describe("notification rule evaluation", () => {
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
  });

  it("blocks duplicates within 24 hours", () => {
    const now = new Date("2026-05-06T12:00:00Z");

    expect(
      isWithinDeduplicationWindow("2026-05-05T13:00:00Z", now)
    ).toBe(true);
    expect(
      isWithinDeduplicationWindow("2026-05-05T11:00:00Z", now)
    ).toBe(false);
  });
});
