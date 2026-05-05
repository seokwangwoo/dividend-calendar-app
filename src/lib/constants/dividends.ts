export const ACCOUNT_TYPES = ["nisa", "tokutei", "general"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const AMOUNT_BASIS = ["before_tax", "after_tax"] as const;
export type AmountBasis = (typeof AMOUNT_BASIS)[number];

export const CALENDAR_ACCOUNT_FILTERS = [
  "all",
  ...ACCOUNT_TYPES
] as const;
export type CalendarAccountFilter = (typeof CALENDAR_ACCOUNT_FILTERS)[number];

export const DIVIDEND_STATUSES = [
  "estimated",
  "confirmed",
  "paid",
  "undecided"
] as const;
export type DividendStatus = (typeof DIVIDEND_STATUSES)[number];

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const ACCOUNT_TYPE_OPTIONS = [
  { value: "nisa", label: "NISA" },
  { value: "tokutei", label: "特定口座" },
  { value: "general", label: "一般口座" }
] as const;

export const AMOUNT_BASIS_OPTIONS = [
  { value: "after_tax", label: "税引後" },
  { value: "before_tax", label: "税引前" }
] as const;
