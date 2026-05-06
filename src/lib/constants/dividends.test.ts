import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPES,
  AMOUNT_BASIS,
  CALENDAR_ACCOUNT_FILTERS,
  DIVIDEND_STATUSES,
  REVIEW_STATUSES,
  ACCOUNT_TYPE_OPTIONS,
  AMOUNT_BASIS_OPTIONS
} from "./dividends";

describe("dividends constants", () => {
  it("ACCOUNT_TYPES has correct values", () => {
    expect(ACCOUNT_TYPES).toEqual(["nisa", "tokutei", "general"]);
  });

  it("AMOUNT_BASIS has correct values", () => {
    expect(AMOUNT_BASIS).toEqual(["before_tax", "after_tax"]);
  });

  it("CALENDAR_ACCOUNT_FILTERS includes all and account types", () => {
    expect(CALENDAR_ACCOUNT_FILTERS).toEqual(["all", "nisa", "tokutei", "general"]);
  });

  it("DIVIDEND_STATUSES has correct values", () => {
    expect(DIVIDEND_STATUSES).toEqual(["estimated", "confirmed", "paid", "undecided"]);
  });

  it("REVIEW_STATUSES has correct values", () => {
    expect(REVIEW_STATUSES).toEqual(["pending", "approved", "rejected"]);
  });

  it("ACCOUNT_TYPE_OPTIONS has correct labels", () => {
    expect(ACCOUNT_TYPE_OPTIONS).toEqual([
      { value: "nisa", label: "NISA" },
      { value: "tokutei", label: "特定口座" },
      { value: "general", label: "一般口座" }
    ]);
  });

  it("AMOUNT_BASIS_OPTIONS has correct labels", () => {
    expect(AMOUNT_BASIS_OPTIONS).toEqual([
      { value: "after_tax", label: "税引後" },
      { value: "before_tax", label: "税引前" }
    ]);
  });
});
