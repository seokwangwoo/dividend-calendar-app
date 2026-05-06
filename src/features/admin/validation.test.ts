import { describe, it, expect } from "vitest";
import { validateMonth, validateDividendAmount, validatePaymentYear } from "./validation";

describe("validateMonth", () => {
  it("returns null for valid months 1–12", () => {
    for (let m = 1; m <= 12; m++) {
      expect(validateMonth(m)).toBeNull();
    }
  });

  it("returns an error for 0", () => {
    expect(validateMonth(0)).not.toBeNull();
  });

  it("returns an error for 13", () => {
    expect(validateMonth(13)).not.toBeNull();
  });

  it("returns an error for non-integer values", () => {
    expect(validateMonth(1.5)).not.toBeNull();
    expect(validateMonth("abc")).not.toBeNull();
    expect(validateMonth(NaN)).not.toBeNull();
  });

  it("returns an error for negative values", () => {
    expect(validateMonth(-1)).not.toBeNull();
  });
});

describe("validateDividendAmount", () => {
  it("returns null for 0 (zero dividend is valid)", () => {
    expect(validateDividendAmount(0)).toBeNull();
  });

  it("returns null for positive amounts", () => {
    expect(validateDividendAmount(10)).toBeNull();
    expect(validateDividendAmount(0.5)).toBeNull();
    expect(validateDividendAmount(100.25)).toBeNull();
  });

  it("returns an error for negative values", () => {
    expect(validateDividendAmount(-1)).not.toBeNull();
    expect(validateDividendAmount(-0.01)).not.toBeNull();
  });

  it("returns an error for NaN", () => {
    expect(validateDividendAmount("abc")).not.toBeNull();
    expect(validateDividendAmount(NaN)).not.toBeNull();
  });
});

describe("validatePaymentYear", () => {
  it("returns null for valid four-digit years 2000–2100", () => {
    expect(validatePaymentYear(2000)).toBeNull();
    expect(validatePaymentYear(2026)).toBeNull();
    expect(validatePaymentYear(2100)).toBeNull();
  });

  it("returns an error for null, undefined, or empty string", () => {
    expect(validatePaymentYear(null)).not.toBeNull();
    expect(validatePaymentYear(undefined)).not.toBeNull();
    expect(validatePaymentYear("")).not.toBeNull();
  });

  it("returns an error for years outside 2000–2100", () => {
    expect(validatePaymentYear(1999)).not.toBeNull();
    expect(validatePaymentYear(2101)).not.toBeNull();
  });

  it("returns an error for non-integer values", () => {
    expect(validatePaymentYear(2025.5)).not.toBeNull();
    expect(validatePaymentYear("abc")).not.toBeNull();
  });
});
