import type { Database } from "@/types/supabase";

type DividendEventType = Database["public"]["Enums"]["dividend_event_type"];
type DividendChangeType = Database["public"]["Enums"]["dividend_change_type"];
type DividendEventStatus =
  Database["public"]["Tables"]["dividend_events"]["Insert"]["status"];

export function validateMonth(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    return "月は1〜12の整数で入力してください";
  }
  return null;
}

export function validateDividendAmount(value: unknown): string | null {
  const n = Number(value);
  if (isNaN(n) || n < 0) {
    return "配当金額は0以上の数値で入力してください";
  }
  return null;
}

export function validatePaymentYear(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return "支払年は必須です";
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) {
    return "支払年は2000〜2100の整数で入力してください";
  }
  return null;
}

export function validateFiscalMonth(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    return "決算月は1〜12の整数で入力してください";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Override validation helpers for Phase 05 review approval
// ---------------------------------------------------------------------------

const VALID_EVENT_TYPES: DividendEventType[] = [
  "interim",
  "year_end",
  "annual_total",
  "special",
  "commemorative",
  "other"
];

const VALID_CHANGE_TYPES: DividendChangeType[] = [
  "increase",
  "decrease",
  "no_dividend",
  "resumed",
  "special",
  "commemorative",
  "none",
  "unchanged",
  "unknown"
];

const VALID_STATUSES: DividendEventStatus[] = [
  "estimated",
  "confirmed",
  "paid",
  "undecided"
];

export function validateEventType(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null; // optional
  if (!VALID_EVENT_TYPES.includes(value as DividendEventType)) {
    return `event_type は ${VALID_EVENT_TYPES.join(", ")} のいずれかで入力してください`;
  }
  return null;
}

export function validateChangeType(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null; // optional
  if (!VALID_CHANGE_TYPES.includes(value as DividendChangeType)) {
    return `change_type は ${VALID_CHANGE_TYPES.join(", ")} のいずれかで入力してください`;
  }
  return null;
}

export function validateEventStatus(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null; // optional
  if (!VALID_STATUSES.includes(value as DividendEventStatus)) {
    return `status は ${VALID_STATUSES.join(", ")} のいずれかで入力してください`;
  }
  return null;
}

export function validateIsoDate(value: unknown, fieldName = "date"): string | null {
  if (value === null || value === undefined || value === "") return null; // optional
  const s = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${fieldName} は YYYY-MM-DD 形式で入力してください`;
  }
  // Strict calendar validation: parse components and verify round-trip equality
  const [year, month, day] = s.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return `${fieldName} は有効な日付で入力してください`;
  }
  return null;
}

/**
 * Override object validator for approve_dividend_review.
 * Returns a map of field -> error message for any invalid fields.
 * Returns an empty object when the override is valid.
 */
export function validateApprovalOverride(override: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};

  const amountError = override.dividendPerShare != null
    ? validateDividendAmount(override.dividendPerShare)
    : null;
  if (amountError) errors.dividendPerShare = amountError;

  const prevError = override.previousDividendPerShare != null
    ? validateDividendAmount(override.previousDividendPerShare)
    : null;
  if (prevError) errors.previousDividendPerShare = prevError;

  const monthError = override.expectedPaymentMonth != null
    ? validateMonth(override.expectedPaymentMonth)
    : null;
  if (monthError) errors.expectedPaymentMonth = monthError;

  const yearError = override.expectedPaymentYear != null
    ? validatePaymentYear(override.expectedPaymentYear)
    : null;
  if (yearError) errors.expectedPaymentYear = yearError;

  const fiscalMonthError = override.fiscalMonth != null
    ? validateFiscalMonth(override.fiscalMonth)
    : null;
  if (fiscalMonthError) errors.fiscalMonth = fiscalMonthError;

  const eventTypeError = validateEventType(override.eventType);
  if (eventTypeError) errors.eventType = eventTypeError;

  const statusError = validateEventStatus(override.status);
  if (statusError) errors.status = statusError;

  const changeTypeError = validateChangeType(override.changeType);
  if (changeTypeError) errors.changeType = changeTypeError;

  const recordDateError = validateIsoDate(override.recordDate, "recordDate");
  if (recordDateError) errors.recordDate = recordDateError;

  const exDivDateError = validateIsoDate(override.exDividendDate, "exDividendDate");
  if (exDivDateError) errors.exDividendDate = exDivDateError;

  return errors;
}
