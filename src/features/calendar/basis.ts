export const CALENDAR_BASIS_OPTIONS = [
  "payment_month",
  "record_date",
  "ex_dividend_date"
] as const;

export type CalendarBasis = (typeof CALENDAR_BASIS_OPTIONS)[number];

export function isValidCalendarBasis(value: string): value is CalendarBasis {
  return CALENDAR_BASIS_OPTIONS.includes(value as CalendarBasis);
}

export function getCalendarBasisLabel(basis: CalendarBasis): string {
  switch (basis) {
    case "payment_month":
      return "支払月";
    case "record_date":
      return "権利確定日";
    case "ex_dividend_date":
      return "除権日";
  }
}
