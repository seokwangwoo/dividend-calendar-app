export const NOTIFICATION_RULE_BASES = [
  "before_tax_yield",
  "after_tax_yield"
] as const;
export type NotificationRuleBasis = (typeof NOTIFICATION_RULE_BASES)[number];

export const NOTIFICATION_OPERATORS = ["gte", "lte"] as const;
export type NotificationOperator = (typeof NOTIFICATION_OPERATORS)[number];

export const NOTIFICATION_RULE_BASIS_OPTIONS = [
  { value: "before_tax_yield", label: "予想配当利回り（税引前）" }
] as const;

export const NOTIFICATION_OPERATOR_OPTIONS = [
  { value: "gte", label: "以上" },
  { value: "lte", label: "以下" }
] as const;

export const INVESTMENT_NEUTRAL_DISCLAIMER =
  "これは売買を推奨するものではありません。\n投資判断はご自身で行ってください。";

/**
 * Disclaimer shown on home and calendar surfaces where users interpret
 * dividend schedule data derived from TDnet/Yanoshin disclosures.
 *
 * Clarifies that the information is schedule management based on public
 * disclosure filings, not buy/sell advice, and that actual payment amounts
 * and tax should be confirmed with brokerage statements.
 */
export const DISCLOSURE_SOURCE_DISCLAIMER =
  "配当予定はTDnet開示資料をもとにしたスケジュール管理のための情報です。実際の支払金額・税額は証券会社の取引報告書でご確認ください。これは売買を推奨するものではありません。";

export const NOTIFICATION_FILTERS = [
  { value: "all", label: "すべて" },
  { value: "yield_target", label: "目標利回り" },
  { value: "dividend_change", label: "配当変更" },
  { value: "data_update", label: "データ更新" }
] as const;

export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number]["value"];
