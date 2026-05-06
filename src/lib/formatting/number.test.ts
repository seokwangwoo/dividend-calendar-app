import { describe, expect, it } from "vitest";
import { formatCurrencyJpy, formatPercent } from "./number";

describe("formatCurrencyJpy", () => {
  it("formats number as JPY", () => {
    expect(formatCurrencyJpy(1000)).toBe("￥1,000");
  });

  it("formats decimal as JPY with no fraction digits", () => {
    expect(formatCurrencyJpy(1234.56)).toBe("￥1,235");
  });

  it("returns dash for null", () => {
    expect(formatCurrencyJpy(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(formatCurrencyJpy(undefined)).toBe("-");
  });

  it("returns dash for NaN", () => {
    expect(formatCurrencyJpy(NaN)).toBe("-");
  });
});

describe("formatPercent", () => {
  it("formats with default digits", () => {
    expect(formatPercent(3.14159)).toBe("3.14%");
  });

  it("formats with custom digits", () => {
    expect(formatPercent(3.14159, 1)).toBe("3.1%");
  });

  it("formats zero", () => {
    expect(formatPercent(0)).toBe("0.00%");
  });

  it("returns dash for null", () => {
    expect(formatPercent(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(formatPercent(undefined)).toBe("-");
  });

  it("returns dash for NaN", () => {
    expect(formatPercent(NaN)).toBe("-");
  });
});
