import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPES,
  AMOUNT_BASIS,
  CALENDAR_ACCOUNT_FILTERS,
  DISCLOSURE_PARSE_STATUSES,
  DISCLOSURE_TYPES,
  DIVIDEND_CHANGE_TYPES,
  DIVIDEND_EVENT_TYPES,
  DIVIDEND_STATUSES,
  JOB_TYPES,
  REVIEW_STATUSES,
  REVIEW_PRIORITIES,
  USER_PAYABLE_DIVIDEND_EVENT_TYPES,
  ACCOUNT_TYPE_OPTIONS,
  AMOUNT_BASIS_OPTIONS,
  isDisclosureParseStatus,
  isDisclosureType,
  isDividendChangeType,
  isDividendEventType,
  isJobType,
  isReviewPriority,
  isReviewStatus,
  isUserPayableDividendEventType
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

  it("PDF AI disclosure contract values are explicit", () => {
    expect(DISCLOSURE_TYPES).toEqual([
      "dividend_forecast_revision",
      "dividend_decision",
      "earnings_release",
      "earnings_revision",
      "correction",
      "other"
    ]);
    expect(DISCLOSURE_PARSE_STATUSES).toEqual([
      "pending",
      "downloaded",
      "parsing",
      "parsed",
      "failed",
      "skipped"
    ]);
    expect(REVIEW_PRIORITIES).toEqual(["low", "normal", "high", "urgent"]);
  });

  it("dividend event and change contract values include AI review cases", () => {
    expect(DIVIDEND_EVENT_TYPES).toEqual([
      "interim",
      "year_end",
      "annual_total",
      "special",
      "commemorative",
      "other"
    ]);
    expect(USER_PAYABLE_DIVIDEND_EVENT_TYPES).toEqual(["interim", "year_end", "other"]);
    expect(DIVIDEND_CHANGE_TYPES).toEqual([
      "increase",
      "decrease",
      "no_dividend",
      "resumed",
      "special",
      "commemorative",
      "unchanged",
      "unknown"
    ]);
  });

  it("REVIEW_STATUSES has correct values", () => {
    expect(REVIEW_STATUSES).toEqual([
      "pending",
      "approved",
      "rejected",
      "needs_manual_check"
    ]);
  });

  it("JOB_TYPES has phase job contract values", () => {
    expect(JOB_TYPES).toEqual([
      "collect_disclosures",
      "download_disclosure_pdf",
      "parse_disclosure_pdf_ai",
      "approve_dividend_review",
      "evaluate_notification_rules"
    ]);
  });

  it("type guards accept known values and reject unknown values", () => {
    expect(isDisclosureType("correction")).toBe(true);
    expect(isDisclosureType("press_release")).toBe(false);
    expect(isDisclosureParseStatus("downloaded")).toBe(true);
    expect(isDisclosureParseStatus("collected")).toBe(false);
    expect(isReviewPriority("urgent")).toBe(true);
    expect(isReviewPriority("blocked")).toBe(false);
    expect(isDividendEventType("annual_total")).toBe(true);
    expect(isDividendEventType("quarterly")).toBe(false);
    expect(isUserPayableDividendEventType("year_end")).toBe(true);
    expect(isUserPayableDividendEventType("annual_total")).toBe(false);
    expect(isReviewStatus("needs_manual_check")).toBe(true);
    expect(isReviewStatus("archived")).toBe(false);
    expect(isDividendChangeType("unknown")).toBe(true);
    expect(isDividendChangeType("split")).toBe(false);
    expect(isJobType("parse_disclosure_pdf_ai")).toBe(true);
    expect(isJobType("parse_disclosure")).toBe(false);
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
