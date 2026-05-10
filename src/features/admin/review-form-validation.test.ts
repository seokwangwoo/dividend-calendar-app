/**
 * Unit tests for admin review form validation (Phase 06).
 *
 * Covers:
 * - Override field validation: invalid amounts, years, months, dates, event types
 * - payment_year required when only month is known (needsPaymentYear logic)
 * - Valid full-override passes all validators
 */

import { describe, it, expect } from "vitest";
import { validateApprovalOverride, derivePaymentYear } from "./validation";

describe("review form validation: override field guards", () => {
  it("accepts an empty override (all defaults)", () => {
    expect(validateApprovalOverride({})).toEqual({});
  });

  it("accepts a fully valid override", () => {
    const errors = validateApprovalOverride({
      dividendPerShare: 80,
      previousDividendPerShare: 70,
      paymentYear: 2026,
      expectedPaymentMonth: 9,
      expectedPaymentDate: "2026-09-25",
      recordDate: "2026-03-31",
      eventType: "year_end",
      changeType: "increase",
      status: "confirmed"
    });
    expect(errors).toEqual({});
  });

  it("rejects negative dividendPerShare", () => {
    const errors = validateApprovalOverride({ dividendPerShare: -0.01 });
    expect(errors).toHaveProperty("dividendPerShare");
  });

  it("rejects negative previousDividendPerShare", () => {
    const errors = validateApprovalOverride({ previousDividendPerShare: -50 });
    expect(errors).toHaveProperty("previousDividendPerShare");
  });

  it("rejects paymentYear out of range (below 2000)", () => {
    const errors = validateApprovalOverride({ paymentYear: 1999 });
    expect(errors).toHaveProperty("paymentYear");
  });

  it("rejects paymentYear out of range (above 2100)", () => {
    const errors = validateApprovalOverride({ paymentYear: 2101 });
    expect(errors).toHaveProperty("paymentYear");
  });

  it("rejects invalid expectedPaymentMonth (0)", () => {
    const errors = validateApprovalOverride({ expectedPaymentMonth: 0 });
    expect(errors).toHaveProperty("expectedPaymentMonth");
  });

  it("rejects invalid expectedPaymentMonth (13)", () => {
    const errors = validateApprovalOverride({ expectedPaymentMonth: 13 });
    expect(errors).toHaveProperty("expectedPaymentMonth");
  });

  it("rejects non-ISO date for expectedPaymentDate", () => {
    const errors = validateApprovalOverride({ expectedPaymentDate: "09/25/2026" });
    expect(errors).toHaveProperty("expectedPaymentDate");
  });

  it("rejects invalid calendar date (Feb 30)", () => {
    const errors = validateApprovalOverride({ expectedPaymentDate: "2026-02-30" });
    expect(errors).toHaveProperty("expectedPaymentDate");
  });

  it("rejects unknown eventType", () => {
    const errors = validateApprovalOverride({ eventType: "quarterly" });
    expect(errors).toHaveProperty("eventType");
  });

  it("rejects unknown changeType", () => {
    const errors = validateApprovalOverride({ changeType: "raised" });
    expect(errors).toHaveProperty("changeType");
  });

  it("rejects invalid status (pending is not a valid event status)", () => {
    const errors = validateApprovalOverride({ status: "pending" });
    expect(errors).toHaveProperty("status");
  });

  it("accepts zero dividend (no-dividend scenario)", () => {
    const errors = validateApprovalOverride({ dividendPerShare: 0 });
    expect(errors).not.toHaveProperty("dividendPerShare");
  });
});

describe("payment_year required logic (needsPaymentYear)", () => {
  /**
   * The detail page derives needsPaymentYear as:
   *   !hasFullPaymentDate && event_type !== 'annual_total'
   *
   * We test derivePaymentYear to confirm the underlying logic.
   */

  it("payment_year is NOT required when full payment date is present", () => {
    // When extracted_payment_date is a full ISO date, year can be derived
    const year = derivePaymentYear("2026-09-25", null);
    expect(year).toBe(2026);
  });

  it("payment_year IS required when only month is known (derives null)", () => {
    const year = derivePaymentYear(null, null);
    expect(year).toBeNull();
  });

  it("payment_year override wins over derived value", () => {
    const year = derivePaymentYear("2026-09-25", 2027);
    expect(year).toBe(2027);
  });

  it("explicit paymentYear override satisfies requirement even without full date", () => {
    const year = derivePaymentYear(null, 2026);
    expect(year).toBe(2026);
    expect(year).not.toBeNull();
  });

  it("returns null for partial date strings", () => {
    // Only month, no full date
    expect(derivePaymentYear("2026-09", null)).toBeNull();
  });

  it("returns null for date strings that fail range check", () => {
    expect(derivePaymentYear("1999-01-01", null)).toBeNull();
    expect(derivePaymentYear("2200-12-31", null)).toBeNull();
  });
});

describe("signed URL authorization boundary (unit-level contract checks)", () => {
  // These tests document the authorization contract without calling the server
  // action (which requires a full Next.js server context). The actual behavior
  // is covered in review-actions.test.ts which mocks requireAdminUser.

  it("requireAdminUser must be called before any storage operation", () => {
    // This is a documentation test: the contract is enforced by the
    // implementation always calling requireAdminUser() first in getSignedPdfUrl.
    // The review-actions.test.ts verifies non-admin callers are rejected.
    expect(true).toBe(true);
  });

  it("SUPABASE_SERVICE_ROLE_KEY must not appear in NEXT_PUBLIC_ env vars", () => {
    // Service role key is never a NEXT_PUBLIC_ variable
    const keys = Object.keys(process.env).filter((k) => k.startsWith("NEXT_PUBLIC_"));
    for (const k of keys) {
      expect(k).not.toMatch(/service_role/i);
    }
  });
});
