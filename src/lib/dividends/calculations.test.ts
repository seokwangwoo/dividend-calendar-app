import { describe, it, expect } from "vitest";
import {
  calculateHoldingDividend,
  calculatePortfolioAfterTaxYield,
  TAX_RATES
} from "./calculations";

const DPS = 100;
const QTY = 100;
const PRICE = 4000;

describe("TAX_RATES", () => {
  it("nisa is 0", () => expect(TAX_RATES.nisa).toBe(0));
  it("tokutei is 20.315%", () => expect(TAX_RATES.tokutei).toBeCloseTo(0.20315));
  it("general is 20.315%", () => expect(TAX_RATES.general).toBeCloseTo(0.20315));
});

describe("calculatePortfolioAfterTaxYield", () => {
  it("uses annual after-tax dividend divided by total acquisition cost", () => {
    expect(
      calculatePortfolioAfterTaxYield({
        annualAfterTaxDividend: 10000,
        totalAcquisitionCost: 400000
      })
    ).toBeCloseTo(2.5);
  });

  it("supports NISA and tokutei holding mixes after tax has been applied", () => {
    const nisaAfterTax = 100 * 100;
    const tokuteiAfterTax = 100 * 100 * (1 - TAX_RATES.tokutei);
    const totalAcquisitionCost = 100 * 4000 + 100 * 4000;

    expect(
      calculatePortfolioAfterTaxYield({
        annualAfterTaxDividend: nisaAfterTax + tokuteiAfterTax,
        totalAcquisitionCost
      })
    ).toBeCloseTo(((nisaAfterTax + tokuteiAfterTax) / totalAcquisitionCost) * 100);
  });

  it("is null when approved annual dividend total is null", () => {
    expect(
      calculatePortfolioAfterTaxYield({
        annualAfterTaxDividend: null,
        totalAcquisitionCost: 400000
      })
    ).toBeNull();
  });
});

describe("calculateHoldingDividend", () => {
  describe("NISA", () => {
    const result = calculateHoldingDividend({
      expectedAnnualDividendPerShare: DPS,
      currentPrice: PRICE,
      quantity: QTY,
      accountType: "nisa",
    });

    it("beforeTaxAmount = DPS * quantity", () =>
      expect(result.beforeTaxAmount).toBe(DPS * QTY));

    it("estimatedTaxAmount = 0", () =>
      expect(result.estimatedTaxAmount).toBe(0));

    it("afterTaxAmount = beforeTaxAmount", () =>
      expect(result.afterTaxAmount).toBe(DPS * QTY));
  });

  describe("tokutei", () => {
    const result = calculateHoldingDividend({
      expectedAnnualDividendPerShare: DPS,
      currentPrice: PRICE,
      quantity: QTY,
      accountType: "tokutei",
    });

    it("estimatedTaxAmount = before * 20.315%", () =>
      expect(result.estimatedTaxAmount).toBeCloseTo(DPS * QTY * 0.20315));

    it("afterTaxAmount = before - tax", () =>
      expect(result.afterTaxAmount).toBeCloseTo(DPS * QTY * (1 - 0.20315)));
  });

  describe("general", () => {
    const result = calculateHoldingDividend({
      expectedAnnualDividendPerShare: DPS,
      currentPrice: PRICE,
      quantity: QTY,
      accountType: "general",
    });

    it("same tax rate as tokutei", () =>
      expect(result.estimatedTaxAmount).toBeCloseTo(DPS * QTY * 0.20315));
  });

  describe("yield calculation", () => {
    it("beforeTaxYield = DPS / price * 100", () => {
      const { beforeTaxYield } = calculateHoldingDividend({
        expectedAnnualDividendPerShare: DPS,
        currentPrice: PRICE,
        quantity: QTY,
        accountType: "tokutei",
      });
      expect(beforeTaxYield).toBeCloseTo((DPS / PRICE) * 100);
    });

    it("afterTaxYield = DPS * (1 - tax) / price * 100", () => {
      const { afterTaxYield } = calculateHoldingDividend({
        expectedAnnualDividendPerShare: DPS,
        currentPrice: PRICE,
        quantity: QTY,
        accountType: "tokutei",
      });
      expect(afterTaxYield).toBeCloseTo((DPS * (1 - 0.20315) / PRICE) * 100);
    });

    it("yield is null when currentPrice is null", () => {
      const { beforeTaxYield, afterTaxYield } = calculateHoldingDividend({
        expectedAnnualDividendPerShare: DPS,
        currentPrice: null,
        quantity: QTY,
        accountType: "tokutei",
      });
      expect(beforeTaxYield).toBeNull();
      expect(afterTaxYield).toBeNull();
    });

    it("yield is null when currentPrice is 0", () => {
      const { beforeTaxYield } = calculateHoldingDividend({
        expectedAnnualDividendPerShare: DPS,
        currentPrice: 0,
        quantity: QTY,
        accountType: "tokutei",
      });
      expect(beforeTaxYield).toBeNull();
    });
  });

  describe("null DPS (未定)", () => {
    const result = calculateHoldingDividend({
      expectedAnnualDividendPerShare: null,
      currentPrice: PRICE,
      quantity: QTY,
      accountType: "tokutei",
    });

    it("all amounts are null", () => {
      expect(result.beforeTaxAmount).toBeNull();
      expect(result.estimatedTaxAmount).toBeNull();
      expect(result.afterTaxAmount).toBeNull();
    });

    it("all yields are null", () => {
      expect(result.beforeTaxYield).toBeNull();
      expect(result.afterTaxYield).toBeNull();
    });
  });

  describe("quantity scaling", () => {
    it("doubling quantity doubles beforeTaxAmount", () => {
      const r1 = calculateHoldingDividend({ expectedAnnualDividendPerShare: DPS, currentPrice: PRICE, quantity: 100, accountType: "nisa" });
      const r2 = calculateHoldingDividend({ expectedAnnualDividendPerShare: DPS, currentPrice: PRICE, quantity: 200, accountType: "nisa" });
      expect(r2.beforeTaxAmount! / r1.beforeTaxAmount!).toBeCloseTo(2);
    });
  });
});
