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

export const DISCLOSURE_TYPES = [
  "dividend_forecast_revision",
  "dividend_decision",
  "earnings_release",
  "earnings_revision",
  "correction",
  "other"
] as const;
export type DisclosureType = (typeof DISCLOSURE_TYPES)[number];

export const DISCLOSURE_PARSE_STATUSES = [
  "pending",
  "downloaded",
  "parsing",
  "parsed",
  "failed",
  "skipped"
] as const;
export type DisclosureParseStatus = (typeof DISCLOSURE_PARSE_STATUSES)[number];

export const REVIEW_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ReviewPriority = (typeof REVIEW_PRIORITIES)[number];

export const DIVIDEND_EVENT_TYPES = [
  "interim",
  "year_end",
  "annual_total",
  "special",
  "commemorative",
  "other"
] as const;
export type DividendEventType = (typeof DIVIDEND_EVENT_TYPES)[number];

export const USER_PAYABLE_DIVIDEND_EVENT_TYPES = [
  "interim",
  "year_end",
  "other"
] as const satisfies readonly DividendEventType[];
export type UserPayableDividendEventType =
  (typeof USER_PAYABLE_DIVIDEND_EVENT_TYPES)[number];

export const REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs_manual_check"
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const DIVIDEND_CHANGE_TYPES = [
  "increase",
  "decrease",
  "no_dividend",
  "resumed",
  "special",
  "commemorative",
  "unchanged",
  "unknown"
] as const;
export type DividendChangeType = (typeof DIVIDEND_CHANGE_TYPES)[number];

export const JOB_TYPES = [
  "collect_disclosures",
  "download_disclosure_pdf",
  "parse_disclosure_pdf_ai",
  "approve_dividend_review",
  "evaluate_notification_rules"
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const ACCOUNT_TYPE_OPTIONS = [
  { value: "nisa", label: "NISA" },
  { value: "tokutei", label: "特定口座" },
  { value: "general", label: "一般口座" }
] as const;

export const AMOUNT_BASIS_OPTIONS = [
  { value: "after_tax", label: "税引後" },
  { value: "before_tax", label: "税引前" }
] as const;

export function isDisclosureType(value: unknown): value is DisclosureType {
  return typeof value === "string" && DISCLOSURE_TYPES.includes(value as DisclosureType);
}

export function isDisclosureParseStatus(value: unknown): value is DisclosureParseStatus {
  return (
    typeof value === "string" &&
    DISCLOSURE_PARSE_STATUSES.includes(value as DisclosureParseStatus)
  );
}

export function isReviewPriority(value: unknown): value is ReviewPriority {
  return typeof value === "string" && REVIEW_PRIORITIES.includes(value as ReviewPriority);
}

export function isDividendEventType(value: unknown): value is DividendEventType {
  return typeof value === "string" && DIVIDEND_EVENT_TYPES.includes(value as DividendEventType);
}

export function isUserPayableDividendEventType(
  value: unknown
): value is UserPayableDividendEventType {
  return (
    typeof value === "string" &&
    USER_PAYABLE_DIVIDEND_EVENT_TYPES.includes(value as UserPayableDividendEventType)
  );
}

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === "string" && REVIEW_STATUSES.includes(value as ReviewStatus);
}

export function isDividendChangeType(value: unknown): value is DividendChangeType {
  return (
    typeof value === "string" &&
    DIVIDEND_CHANGE_TYPES.includes(value as DividendChangeType)
  );
}

export function isJobType(value: unknown): value is JobType {
  return typeof value === "string" && JOB_TYPES.includes(value as JobType);
}
