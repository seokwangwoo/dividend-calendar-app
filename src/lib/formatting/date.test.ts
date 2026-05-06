import { describe, expect, it } from "vitest";
import { formatYearMonth } from "./date";

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
