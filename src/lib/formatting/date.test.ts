import { describe, expect, it } from "vitest";
import { formatPaymentYearMonth, formatYearMonth } from "./date";

describe("formatYearMonth", () => {
  it("formats year and month", () => {
    expect(formatYearMonth(2026, 5)).toBe("2026年5月");
  });

  it("formats single-digit month", () => {
    expect(formatYearMonth(2024, 1)).toBe("2024年1月");
  });

  it("formats double-digit month", () => {
    expect(formatYearMonth(2024, 12)).toBe("2024年12月");
  });
});

describe("formatPaymentYearMonth", () => {
  it("formats payment year and month without a day", () => {
    expect(formatPaymentYearMonth(2026, 6)).toBe("2026年6月");
  });

  it("formats month-only payment timing as planned", () => {
    expect(formatPaymentYearMonth(null, 6)).toBe("6月予定");
  });

  it("formats unknown payment timing", () => {
    expect(formatPaymentYearMonth(null, null)).toBe("未定");
  });
});
