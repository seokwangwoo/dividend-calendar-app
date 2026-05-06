import { describe, expect, it } from "vitest";
import {
  CALENDAR_BASIS_OPTIONS,
  isValidCalendarBasis,
  getCalendarBasisLabel
} from "@/features/calendar/basis";

describe("calendar basis", () => {
  it("enum values are exactly payment_month, record_date, ex_dividend_date", () => {
    expect(CALENDAR_BASIS_OPTIONS).toEqual([
      "payment_month",
      "record_date",
      "ex_dividend_date"
    ]);
  });

  it("validates known basis values", () => {
    expect(isValidCalendarBasis("payment_month")).toBe(true);
    expect(isValidCalendarBasis("record_date")).toBe(true);
    expect(isValidCalendarBasis("ex_dividend_date")).toBe(true);
  });

  it("rejects invalid basis values", () => {
    expect(isValidCalendarBasis("invalid")).toBe(false);
    expect(isValidCalendarBasis("")).toBe(false);
  });

  it("returns correct labels", () => {
    expect(getCalendarBasisLabel("payment_month")).toBe("支払月");
    expect(getCalendarBasisLabel("record_date")).toBe("権利確定日");
    expect(getCalendarBasisLabel("ex_dividend_date")).toBe("除権日");
  });
});
