import { describe, it, expect } from "vitest";
import {
  validateMonth,
  validateDividendAmount,
  validatePaymentYear,
  validateFiscalMonth,
  validateEventType,
  validateChangeType,
  validateEventStatus,
  validateIsoDate,
  validateApprovalOverride
} from "./validation";

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

describe("validateFiscalMonth", () => {
  it("returns null for valid months 1–12", () => {
    for (let m = 1; m <= 12; m++) {
      expect(validateFiscalMonth(m)).toBeNull();
    }
  });

  it("returns an error for 0", () => {
    expect(validateFiscalMonth(0)).not.toBeNull();
  });

  it("returns an error for 13", () => {
    expect(validateFiscalMonth(13)).not.toBeNull();
  });

  it("returns an error for non-integer values", () => {
    expect(validateFiscalMonth(1.5)).not.toBeNull();
    expect(validateFiscalMonth("abc")).not.toBeNull();
    expect(validateFiscalMonth(NaN)).not.toBeNull();
  });
});

describe("validateEventType", () => {
  it("returns null for valid event types", () => {
    for (const t of ["interim", "year_end", "annual_total", "special", "commemorative", "other"]) {
      expect(validateEventType(t)).toBeNull();
    }
  });

  it("returns null for null/undefined/empty (field is optional)", () => {
    expect(validateEventType(null)).toBeNull();
    expect(validateEventType(undefined)).toBeNull();
    expect(validateEventType("")).toBeNull();
  });

  it("returns an error for unknown event types", () => {
    expect(validateEventType("quarterly")).not.toBeNull();
    expect(validateEventType("unknown_type")).not.toBeNull();
  });
});

describe("validateChangeType", () => {
  it("returns null for valid change types", () => {
    for (const t of [
      "increase",
      "decrease",
      "no_dividend",
      "resumed",
      "special",
      "commemorative",
      "unchanged",
      "unknown"
    ]) {
      expect(validateChangeType(t)).toBeNull();
    }
  });

  it("returns null for null/undefined/empty (field is optional)", () => {
    expect(validateChangeType(null)).toBeNull();
    expect(validateChangeType(undefined)).toBeNull();
    expect(validateChangeType("")).toBeNull();
  });

  it("returns an error for unknown change types", () => {
    expect(validateChangeType("raised")).not.toBeNull();
    expect(validateChangeType("cut")).not.toBeNull();
  });
});

describe("validateEventStatus", () => {
  it("returns null for valid statuses", () => {
    for (const s of ["estimated", "confirmed", "paid", "undecided"]) {
      expect(validateEventStatus(s)).toBeNull();
    }
  });

  it("returns null for null/undefined/empty (field is optional)", () => {
    expect(validateEventStatus(null)).toBeNull();
    expect(validateEventStatus(undefined)).toBeNull();
    expect(validateEventStatus("")).toBeNull();
  });

  it("returns an error for invalid statuses", () => {
    expect(validateEventStatus("approved")).not.toBeNull();
    expect(validateEventStatus("pending")).not.toBeNull();
  });
});

describe("validateIsoDate", () => {
  it("returns null for valid ISO dates", () => {
    expect(validateIsoDate("2026-03-31")).toBeNull();
    expect(validateIsoDate("2000-01-01")).toBeNull();
  });

  it("returns null for null/undefined/empty (field is optional)", () => {
    expect(validateIsoDate(null)).toBeNull();
    expect(validateIsoDate(undefined)).toBeNull();
    expect(validateIsoDate("")).toBeNull();
  });

  it("returns an error for non-ISO date strings", () => {
    expect(validateIsoDate("31/03/2026")).not.toBeNull();
    expect(validateIsoDate("2026-3-1")).not.toBeNull();
    expect(validateIsoDate("not-a-date")).not.toBeNull();
  });

  it("returns an error for invalid calendar dates", () => {
    expect(validateIsoDate("2026-02-30")).not.toBeNull();
    expect(validateIsoDate("2026-13-01")).not.toBeNull();
  });
});

describe("validateApprovalOverride", () => {
  it("returns no errors for empty override", () => {
    expect(validateApprovalOverride({})).toEqual({});
  });

  it("returns no errors for a valid full override", () => {
    const errors = validateApprovalOverride({
      dividendPerShare: 120,
      previousDividendPerShare: 100,
      expectedPaymentMonth: 6,
      expectedPaymentYear: 2026,
      fiscalMonth: 3,
      eventType: "year_end",
      status: "confirmed",
      changeType: "increase",
      recordDate: "2026-03-31"
    });
    expect(errors).toEqual({});
  });

  it("catches negative dividendPerShare", () => {
    const errors = validateApprovalOverride({ dividendPerShare: -10 });
    expect(errors).toHaveProperty("dividendPerShare");
  });

  it("catches negative previousDividendPerShare", () => {
    const errors = validateApprovalOverride({ previousDividendPerShare: -5 });
    expect(errors).toHaveProperty("previousDividendPerShare");
  });

  it("catches invalid expectedPaymentMonth", () => {
    const errors = validateApprovalOverride({ expectedPaymentMonth: 13 });
    expect(errors).toHaveProperty("expectedPaymentMonth");
  });

  it("catches invalid expectedPaymentYear", () => {
    const errors = validateApprovalOverride({ expectedPaymentYear: 1999 });
    expect(errors).toHaveProperty("expectedPaymentYear");
  });

  it("catches invalid fiscalMonth", () => {
    const errors = validateApprovalOverride({ fiscalMonth: 13 });
    expect(errors).toHaveProperty("fiscalMonth");
  });

  it("catches unknown eventType", () => {
    const errors = validateApprovalOverride({ eventType: "quarterly" });
    expect(errors).toHaveProperty("eventType");
  });

  it("catches unknown changeType", () => {
    const errors = validateApprovalOverride({ changeType: "raised" });
    expect(errors).toHaveProperty("changeType");
  });

  it("catches invalid status", () => {
    const errors = validateApprovalOverride({ status: "approved" });
    expect(errors).toHaveProperty("status");
  });

  it("does not complain about exDividendDate: null (explicitly excluded)", () => {
    const errors = validateApprovalOverride({ exDividendDate: null });
    expect(errors).not.toHaveProperty("exDividendDate");
  });
});
